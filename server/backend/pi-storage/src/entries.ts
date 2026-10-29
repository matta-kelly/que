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
  type ScanOrder,
  type Seq,
} from "@earendil-works/pi-durable";
import type { Queryable } from "./storage.ts";

export async function writeEntry(
  db: Queryable,
  entry: EntryRecord,
  seq: Seq,
): Promise<void> {
  await db.query(
    `INSERT INTO pi.entries (id, conversation_id, commit_seq, record)
     VALUES ($1, $2, $3, $4)`,
    [entry.id, entry.conversationId, seq, JSON.stringify(entry)],
  );
}

// The fork chain of conversation $1, each with the highest entry id visible through it: no cap for the conversation
// itself, or $2 when given; each fork point for its ancestors. LEAST skips a NULL.
const CHAIN = `
  WITH RECURSIVE chain (conversation_id, upper) AS (
    SELECT id, $2::bigint FROM pi.conversations WHERE id = $1
    UNION ALL
    SELECT (c.record->'parent'->>'conversationId')::bigint,
           LEAST(chain.upper, (c.record->'parent'->>'at')::bigint)
    FROM chain JOIN pi.conversations c ON c.id = chain.conversation_id
    WHERE c.record ? 'parent'
  )`;

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
) {
  const known = await db.query("SELECT 1 FROM pi.conversations WHERE id = $1", [
    conversationId,
  ]);
  if (known.rows.length === 0)
    throw new StorageRequestError(`Unknown conversation: ${conversationId}`);
  const { rows } = await db.query(
    `${CHAIN}
    SELECT e.record, e.commit_seq FROM pi.entries e
    JOIN chain ON e.conversation_id = chain.conversation_id
    WHERE (chain.upper IS NULL OR e.id <= chain.upper)
      AND ($3::bigint IS NULL OR e.id >= $3)
      AND (NOT $4 OR e.record ? 'head')
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
  const rows =
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
    : { entry: rows[0].record, commitSeq: Number(rows[0].commit_seq) as Seq };
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
  return rows[0]?.record;
}

/** The visible entries in the query's bounds, in its order, after the cursor's id. The cursor holds its order. */
export async function scanEntries(
  db: Queryable,
  query: EntryQuery,
  limit: number,
  cursor: Cursor | undefined,
): Promise<Page<EntryRecord, Cursor>> {
  const order =
    cursor === undefined
      ? (query.order ?? "descending")
      : cursorOrder(cursor, query.order);
  const descending = order === "descending";
  let max: number | null = query.maxEntryId ?? null;
  let min: number | null = query.minEntryId ?? null;
  // The cursor narrows the bound on the side the scan moves away from.
  if (cursor !== undefined) {
    const after = cursor.after as number;
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
  const items = rows.slice(0, limit).map((row) => row.record as EntryRecord);
  return rows.length > limit
    ? { items, next: { after: items.at(-1)!.id, order } }
    : { items };
}

// The order an entry cursor continues: the one it was made with. A cursor that is not one, or another order, throws.
function cursorOrder(
  cursor: Cursor,
  requested: ScanOrder | undefined,
): ScanOrder {
  const { after, order } = cursor;
  if (
    !Number.isSafeInteger(after) ||
    (order !== "ascending" && order !== "descending")
  )
    throw new StorageRequestError("Invalid storage cursor");
  if (requested !== undefined && requested !== order)
    throw new StorageRequestError(
      `The cursor continues a ${order} scan; the query asks for ${requested}`,
    );
  return order;
}
