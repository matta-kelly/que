/**
 * pi's one id namespace: a record holds an id no other record holds, in any table.
 * A write checks an id before it stores it, as pi's `MemoryStorage.checkGlobalIds` does.
 */

import type { Queryable } from "./storage.ts";

/** A record type the storage stores. Documents are not stored yet. */
export type Table = "conversation" | "entry" | "task" | "submission";

// The type of the record that holds `id`, if any.
async function recordType(
  db: Queryable,
  id: number,
): Promise<string | undefined> {
  const { rows } = await db.query(
    `SELECT type FROM (
       SELECT 'conversation' AS type FROM pi.conversations WHERE id = $1
       UNION ALL SELECT 'entry' FROM pi.entries WHERE id = $1
       UNION ALL SELECT 'task' FROM pi.tasks WHERE id = $1
       UNION ALL SELECT 'submission' FROM pi.submissions WHERE id = $1
     ) records LIMIT 1`,
    [id],
  );
  return rows[0]?.type;
}

/**
 * Throws when `id` already belongs to a record, except that a `table` that replaces its own record may keep it:
 * a conversation or an entry is created, so any owner is an error; a task or a submission is replaced whole.
 */
export async function checkRecordId(
  db: Queryable,
  id: number,
  table: Table,
): Promise<void> {
  const existing = await recordType(db, id);
  const replaces =
    (table === "task" || table === "submission") && existing === table;
  if (existing !== undefined && !replaces)
    throw new Error(`ID ${id} already belongs to ${existing}`);
}
