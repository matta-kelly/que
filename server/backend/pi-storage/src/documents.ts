/**
 * pi's documents on Postgres: each incarnation and every revision of its content, its writes in a commit, and the
 * reads by address, by id at a point, and by exact scope. A record is JSON text, for the reason an entry's is.
 * A document the definition keeps only the current state of keeps current revisions only, as pi's `MemoryStorage` does.
 */

import { applyImmutableBatches } from "@earendil-works/chord/delta";
import type { Op } from "@earendil-works/chord/delta";
import {
  StorageRequestError,
  type Cursor,
  type DocumentAddress,
  type DocumentContent,
  type DocumentCreate,
  type DocumentId,
  type DocumentPoint,
  type DocumentQuery,
  type DocumentRecord,
  type Page,
  type Seq,
  type StorageWrite,
  type StoredDocument,
} from "@earendil-works/pi-durable";
import { addressKey, encoded, scopeKey } from "./identity.ts";
import { checkRecordId } from "./ids.ts";
import { page, scanSql, scanStart } from "./scan.ts";
import type { Queryable } from "./storage.ts";

/** One document write: a create, a copy, a change, or a retire. */
export type DocumentWrite = Extract<
  StorageWrite,
  { readonly type: `document.${string}` }
>;

type DocumentRow = { record: string };
type RevisionRow = { kind: string; version: number; content: string };
type Action = {
  create?: DocumentCreate;
  content?: DocumentContent;
  retire: boolean;
};
type ConversationDoc = Extract<
  DocumentRecord | DocumentCreate,
  { scope: { kind: "conversation" } }
>;

const isConversationDoc = (
  record: DocumentRecord | DocumentCreate,
): record is ConversationDoc => record.scope.kind === "conversation";

const recordOf = <T>(row: DocumentRow): T => JSON.parse(row.record) as T;

const isCurrentOnly = (record: DocumentRecord): boolean =>
  record.scope.kind !== "conversation" || record.history === "latest";

const aliveAt = (record: DocumentRecord, at: DocumentPoint): boolean =>
  at === "current"
    ? record.retiredAt === undefined
    : record.createdAt <= at &&
      (record.retiredAt === undefined || at < record.retiredAt);

async function storedRecord(
  db: Queryable,
  id: DocumentId,
): Promise<DocumentRecord | undefined> {
  const { rows } = await db.query(
    "SELECT record FROM pi.documents WHERE id = $1",
    [id],
  );
  return rows[0] === undefined ? undefined : recordOf<DocumentRecord>(rows[0]);
}

async function currentAt(
  db: Queryable,
  address: string,
): Promise<DocumentId | undefined> {
  const { rows } = await db.query(
    "SELECT id FROM pi.documents WHERE address = $1 AND retired_at IS NULL",
    [address],
  );
  return rows[0]?.id as DocumentId | undefined;
}

async function latestRevision(
  db: Queryable,
  id: DocumentId,
): Promise<RevisionRow | undefined> {
  const { rows } = await db.query(
    `SELECT kind, version, content FROM pi.document_revisions
     WHERE document_id = $1 ORDER BY seq DESC LIMIT 1`,
    [id],
  );
  return rows[0] as RevisionRow | undefined;
}

/** The stored value at a point: a record alive there, its latest base at or below the point, and the deltas after it. */
async function materialize(
  db: Queryable,
  id: DocumentId,
  at: DocumentPoint,
): Promise<StoredDocument | undefined> {
  const record = await storedRecord(db, id);
  if (record === undefined) return undefined;
  if (at !== "current" && isCurrentOnly(record))
    throw new StorageRequestError(
      `Document ${id} does not retain historical content`,
    );
  if (!aliveAt(record, at)) return undefined;
  const { rows } = (await db.query(
    `SELECT kind, version, content FROM pi.document_revisions
     WHERE document_id = $1 AND ($2::bigint IS NULL OR seq <= $2)
     ORDER BY seq`,
    [id, at === "current" ? null : at],
  )) as { rows: RevisionRow[] };
  let baseIndex = rows.length - 1;
  while (baseIndex >= 0 && rows[baseIndex].kind !== "base") baseIndex--;
  const base = rows[baseIndex];
  if (base === undefined)
    throw new Error(`Document ${id} is missing a required base`);
  const batches: Op[][] = [];
  for (let index = baseIndex + 1; index < rows.length; index++) {
    const revision = rows[index];
    if (revision.kind !== "delta" || revision.version !== base.version)
      throw new Error(
        `Document ${id} crosses a stored version boundary without a base`,
      );
    batches.push(JSON.parse(revision.content) as Op[]);
  }
  return {
    record,
    version: base.version,
    value: applyImmutableBatches(
      JSON.parse(base.content) as StoredDocument["value"],
      batches,
    ),
    deltasSinceBase: rows.length - baseIndex - 1,
  };
}

/** Resolve each copy to a base of its source, and reject one whose source is changed in the same batch. */
async function resolveCopies(
  db: Queryable,
  writes: readonly DocumentWrite[],
): Promise<DocumentWrite[]> {
  if (!writes.some((write) => write.type === "document.copy"))
    return [...writes];
  const changed = new Set<number>();
  for (const write of writes) {
    if (write.type === "document.create" || write.type === "document.copy")
      changed.add(write.record.id);
    else if (
      write.type === "document.change" ||
      write.type === "document.retire"
    )
      changed.add(write.id);
  }
  const resolved: DocumentWrite[] = [];
  for (const write of writes) {
    if (write.type !== "document.copy") {
      resolved.push(write);
      continue;
    }
    try {
      if (changed.has(write.source.id))
        throw new Error(
          `Fork source document ${write.source.id} is changed in the copy batch`,
        );
      const source = await materialize(db, write.source.id, write.source.at);
      if (source === undefined)
        throw new Error(
          `Fork source document ${write.source.id} cannot be read`,
        );
      const copy = write.record;
      if (
        !isConversationDoc(source.record) ||
        !isConversationDoc(copy) ||
        source.record.kind !== copy.kind ||
        source.record.key !== copy.key ||
        source.record.history !== copy.history ||
        source.record.fork !== copy.fork
      )
        throw new Error(
          `Fork source document ${write.source.id} does not match the copied record`,
        );
      resolved.push({
        type: "document.create",
        record: copy,
        content: { kind: "base", version: source.version, value: source.value },
      });
    } catch (error) {
      throw new Error(`Document copy ${write.record.id} was rejected`, {
        cause: error,
      });
    }
  }
  return resolved;
}

function actionsOf(writes: readonly DocumentWrite[]): Map<DocumentId, Action> {
  const actions = new Map<DocumentId, Action>();
  for (const write of writes) {
    if (write.type === "document.copy") continue;
    const id = write.type === "document.create" ? write.record.id : write.id;
    let action = actions.get(id);
    if (action === undefined) {
      action = { retire: false };
      actions.set(id, action);
    }
    if (write.type === "document.create") {
      if (action.create !== undefined || action.content !== undefined)
        throw new Error(`Document ${id} has more than one content command`);
      action.create = write.record;
      action.content = write.content;
    } else if (write.type === "document.change") {
      if (action.content !== undefined)
        throw new Error(`Document ${id} has more than one content command`);
      action.content = write.content;
    } else {
      if (action.retire)
        throw new Error(`Document ${id} is retired more than once`);
      action.retire = true;
    }
  }
  return actions;
}

/** pi's lifecycle checks, before any of the batch is stored. */
async function checkActions(
  db: Queryable,
  actions: Map<DocumentId, Action>,
): Promise<void> {
  const liveCounts = new Map<string, number>();
  for (const [id, action] of actions) {
    const existing = await storedRecord(db, id);
    if (action.create === undefined && existing === undefined)
      throw new Error(`Unknown document: ${id}`);
    if (action.create !== undefined && existing !== undefined)
      throw new Error(`Document ${id} already exists`);
    if (existing?.retiredAt !== undefined)
      throw new Error(`Document ${id} is retired`);
    if (action.content?.kind === "delta") {
      const previous = await latestRevision(db, id);
      if (previous === undefined)
        throw new Error(`Document ${id} delta has no base`);
      if (previous.version !== action.content.version)
        throw new Error(`Document ${id} version transition requires a base`);
    }
    const key = addressKey(
      action.create === undefined ? existing! : action.create,
    );
    const current = await currentAt(db, key);
    let live = liveCounts.get(key);
    if (live === undefined) live = current === undefined ? 0 : 1;
    if (action.retire && current === id) live--;
    if (action.create !== undefined && !action.retire) live++;
    liveCounts.set(key, live);
  }
  for (const live of liveCounts.values()) {
    if (live > 1)
      throw new Error("Document address already has a current incarnation");
  }
}

async function insertRevision(
  db: Queryable,
  id: DocumentId,
  seq: Seq,
  content: DocumentContent,
): Promise<void> {
  await db.query(
    `INSERT INTO pi.document_revisions (document_id, seq, kind, version, content)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      id,
      seq,
      content.kind,
      content.version,
      JSON.stringify(content.kind === "base" ? content.value : content.ops),
    ],
  );
}

/**
 * One commit's document writes, validated as one batch and then stored, as pi's `prepareDocumentActions` does:
 * a create makes the incarnation and its first base, a change appends a revision, and a retire closes the lifetime.
 */
export async function writeDocument(
  db: Queryable,
  writes: readonly DocumentWrite[],
  seq: Seq,
): Promise<void> {
  const resolved = await resolveCopies(db, writes);
  const claimed = new Set<number>();
  for (const write of resolved) {
    if (write.type !== "document.create" && write.type !== "document.copy")
      continue;
    if (claimed.has(write.record.id))
      throw new Error(`ID ${write.record.id} is written more than once`);
    claimed.add(write.record.id);
    await checkRecordId(db, write.record.id, "document");
  }
  const actions = actionsOf(resolved);
  await checkActions(db, actions);
  for (const [id, action] of actions) {
    if (action.create !== undefined) {
      const record: DocumentRecord = {
        ...action.create,
        createdAt: seq,
        ...(action.retire ? { retiredAt: seq } : {}),
      };
      await db.query(
        `INSERT INTO pi.documents (id, address, scope, kind, created_at, retired_at, record)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          addressKey(record),
          scopeKey(record.scope),
          encoded(record.kind),
          record.createdAt,
          record.retiredAt ?? null,
          JSON.stringify(record),
        ],
      );
      if (action.retire && isCurrentOnly(record)) continue;
      await insertRevision(db, id, seq, action.content!);
      continue;
    }
    const existing = (await storedRecord(db, id))!;
    if (action.content?.kind === "base" && isCurrentOnly(existing))
      await db.query(
        "DELETE FROM pi.document_revisions WHERE document_id = $1",
        [id],
      );
    if (action.content !== undefined)
      await insertRevision(db, id, seq, action.content);
    if (action.retire) {
      const retired = { ...existing, retiredAt: seq };
      await db.query(
        "UPDATE pi.documents SET retired_at = $2, record = $3 WHERE id = $1",
        [id, seq, JSON.stringify(retired)],
      );
      if (isCurrentOnly(existing))
        await db.query(
          "DELETE FROM pi.document_revisions WHERE document_id = $1",
          [id],
        );
    }
  }
}

/** The incarnation at one logical address that is alive at the point. */
export async function findDocument(
  db: Queryable,
  address: DocumentAddress,
  at: DocumentPoint,
): Promise<DocumentRecord | undefined> {
  const { rows } = await db.query(
    at === "current"
      ? `SELECT record FROM pi.documents
         WHERE address = $1 AND retired_at IS NULL LIMIT 1`
      : `SELECT record FROM pi.documents
         WHERE address = $1 AND created_at <= $2
           AND (retired_at IS NULL OR $2 < retired_at)
         ORDER BY id LIMIT 1`,
    at === "current" ? [addressKey(address)] : [addressKey(address), at],
  );
  return rows[0] === undefined ? undefined : recordOf<DocumentRecord>(rows[0]);
}

/** One incarnation by id at the point: the latest base at or below it and every delta after it. */
export async function document(
  db: Queryable,
  id: DocumentId,
  at: DocumentPoint,
): Promise<StoredDocument | undefined> {
  return materialize(db, id, at);
}

/** The incarnations alive in one exact scope at the point, in id order, after the cursor's id. */
export async function scanDocuments(
  db: Queryable,
  query: DocumentQuery,
  limit: number,
  cursor: Cursor | undefined,
): Promise<Page<DocumentRecord, Cursor>> {
  const { order, after } = scanStart(undefined, cursor, "ascending");
  const { direction, clause, param } = scanSql({ order, after });
  const clauses = [clause, "scope = $2"];
  const params: unknown[] = [param, scopeKey(query.scope)];
  const alive =
    query.at === "current"
      ? "retired_at IS NULL"
      : "created_at <= $3 AND (retired_at IS NULL OR $3 < retired_at)";
  if (query.at !== "current") params.push(query.at);
  clauses.push(alive);
  if (query.kind !== undefined) {
    params.push(encoded(query.kind));
    clauses.push(`kind = $${params.length}`);
  }
  params.push(limit + 1);
  const { rows } = await db.query(
    `SELECT record FROM pi.documents WHERE ${clauses.join(" AND ")}
     ORDER BY id ${direction} LIMIT $${params.length}`,
    params,
  );
  const items = rows
    .slice(0, limit)
    .map((row) => recordOf<DocumentRecord>(row));
  return page(items, rows.length > limit, order);
}
