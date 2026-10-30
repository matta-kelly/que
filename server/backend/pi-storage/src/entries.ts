/**
 * pi's entries on Postgres: their write in a commit, and the reads through a conversation's fork history.
 * An entry is visible in a conversation when it is in the conversation, or in an ancestor at or below the fork point
 * through which the history is inherited (pi's `MemoryStorage.visibleEntries`).
 */

import {
  StorageRequestError,
  type ConversationId,
  type Cursor,
  type EntryId,
  type EntryQuery,
  type EntryRecord,
  type Page,
  type Seq,
} from "@earendil-works/pi-durable";
import { checkRecordId } from "./ids.ts";
import { scanStart } from "./scan.ts";
import type { Queryable } from "./storage.ts";

// The record is JSON text, not jsonb: JSON.stringify escapes U+0000 and a lone surrogate, which jsonb refuses.
// What the queries read of it has a column of its own.
export async function writeEntry(
  db: Queryable,
  entry: EntryRecord,
  seq: Seq,
): Promise<void> {
  await checkRecordId(db, entry.id, "entry");
  await db.query(
    `INSERT INTO pi.entries (id, conversation_id, head, commit_seq, record)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      entry.id,
      entry.conversationId,
      entry.head ?? null,
      seq,
      JSON.stringify(entry),
    ],
  );
}

type Row = { record: string; commit_seq: number | string };

const record = (row: Row) => JSON.parse(row.record) as EntryRecord;

// The visible entries of a conversation in [min, max], either bound open when null, in id order, at most `limit`.
// An ancestor's visible entries are older than the fork that inherits them, so id order is history order.
async function visible(
  db: Queryable,
  conversationId: ConversationId,
  {
    min,
    max,
    headOnly = false,
  }: { min: number | null; max: number | null; headOnly?: boolean },
  order: "ASC" | "DESC",
  limit: number,
): Promise<Row[]> {
  const known = await db.query("SELECT 1 FROM pi.conversations WHERE id = $1", [
    conversationId,
  ]);
  if (known.rows.length === 0)
    throw new StorageRequestError(`Unknown conversation: ${conversationId}`);
  // The fork chain: each conversation with the highest entry id visible through it, `max` for the conversation
  // itself and each fork point for its ancestors. LEAST skips a NULL.
  const { rows } = await db.query(
    `WITH RECURSIVE chain (conversation_id, upper) AS (
      SELECT id, $2::bigint FROM pi.conversations WHERE id = $1
      UNION ALL
      SELECT (c.record->'parent'->>'conversationId')::bigint,
             LEAST(chain.upper, (c.record->'parent'->>'at')::bigint)
      FROM chain JOIN pi.conversations c ON c.id = chain.conversation_id
      WHERE c.record ? 'parent'
    )
    SELECT e.record, e.commit_seq FROM pi.entries e
    JOIN chain ON e.conversation_id = chain.conversation_id
    WHERE (chain.upper IS NULL OR e.id <= chain.upper)
      AND ($3::bigint IS NULL OR e.id >= $3)
      AND (NOT $4::boolean OR e.head IS NOT NULL)
    ORDER BY e.id ${order} LIMIT $5`,
    [conversationId, max, min, headOnly, limit],
  );
  return rows;
}

/** One entry by id, and its commit's sequence; with a conversation, only when the entry is visible through it. */
export async function entry(
  db: Queryable,
  id: EntryId,
  conversationId?: ConversationId,
): Promise<{ entry: EntryRecord; commitSeq: Seq } | undefined> {
  const rows: Row[] =
    conversationId === undefined
      ? (
          await db.query(
            "SELECT record, commit_seq FROM pi.entries WHERE id = $1",
            [id],
          )
        ).rows
      : await visible(db, conversationId, { min: id, max: id }, "DESC", 1);
  return rows[0] === undefined
    ? undefined
    : { entry: record(rows[0]), commitSeq: Number(rows[0].commit_seq) as Seq };
}

/** The newest visible entry with a `head`, at or below `atOrBefore`. */
export async function findLatestHeadMarker(
  db: Queryable,
  conversationId: ConversationId,
  atOrBefore: EntryId | undefined,
): Promise<(EntryRecord & { readonly head: EntryId }) | undefined> {
  const rows = await visible(
    db,
    conversationId,
    { min: null, max: atOrBefore ?? null, headOnly: true },
    "DESC",
    1,
  );
  return rows[0] && (record(rows[0]) as EntryRecord & { head: EntryId });
}

/** The visible entries in the query's bounds, in its order, after the cursor's id. The cursor holds its order. */
export async function scanEntries(
  db: Queryable,
  query: EntryQuery,
  limit: number,
  cursor: Cursor | undefined,
): Promise<Page<EntryRecord, Cursor>> {
  const { order, after } = scanStart(query.order, cursor, "descending");
  const descending = order === "descending";
  let max: number | null = query.maxEntryId ?? null;
  let min: number | null = query.minEntryId ?? null;
  // The cursor narrows the bound on the side the scan moves away from.
  if (after !== undefined) {
    if (descending) max = Math.min(max ?? after, after - 1);
    else min = Math.max(min ?? after, after + 1);
  }
  const rows = await visible(
    db,
    query.conversationId,
    { min, max },
    descending ? "DESC" : "ASC",
    limit + 1,
  );
  const items = rows.slice(0, limit).map(record);
  return rows.length > limit
    ? { items, next: { after: items.at(-1)!.id, order } }
    : { items };
}
