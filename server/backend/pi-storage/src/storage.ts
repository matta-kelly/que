/**
 * pi's `Storage` on Postgres: its conversations, and the commit, id and close they need.
 * Entries, tasks, submissions and documents are not written yet.
 */

import type {
  ConversationRecord,
  Cursor,
  Id,
  Seq,
  Storage,
} from "@earendil-works/pi-durable";
import { SETUP } from "./schema.ts";

/** What the storage runs its queries on: a pg client, PGlite, or anything with the same `query`. */
export type Queryable = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
};

// A declaration, not an arrow: a call to it narrows the type after it.
function notImplemented(): never {
  throw new Error("not implemented");
}

/** The storage, on a database it does not own: `close` releases the storage, and the caller closes the database. */
export function storageOn(db: Queryable): Storage {
  const ready = db.query(SETUP);
  let closed = false;

  // Every operation waits for the tables, and rejects once the storage is closed.
  const open = async () => {
    if (closed) throw new Error("pi's storage is closed");
    await ready;
  };

  return {
    // BEGIN and COMMIT make one transaction because the database is one connection: a client, not a pool.
    async commit(writes) {
      await open();
      await db.query("BEGIN");
      try {
        for (const write of writes) {
          if (write.type !== "conversation") notImplemented();
          const { id, owner } = write.value;
          const { rows } = await db.query(
            `INSERT INTO pi.conversations (id, owner_conversation_id, owner_task_id, record)
             VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING RETURNING id`,
            [
              id,
              owner?.conversationId ?? null,
              owner?.taskId ?? null,
              JSON.stringify(write.value),
            ],
          );
          if (rows.length === 0)
            throw new Error(`ID ${id} already belongs to conversation`);
          // A stored id the sequence has not reached moves it past that id, so mintId never gives it.
          await db.query(
            "SELECT setval('pi.ids', $1) FROM pi.ids WHERE $1 >= last_value + is_called::int",
            [id],
          );
        }
        const { rows } = await db.query(
          "SELECT nextval('pi.commit_seqs') AS seq",
        );
        await db.query("COMMIT");
        return Number(rows[0].seq) as Seq;
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      }
    },
    async mintId<I extends Id<string>>() {
      await open();
      const { rows } = await db.query("SELECT nextval('pi.ids') AS id");
      return Number(rows[0].id) as I;
    },
    async conversation(id) {
      await open();
      const { rows } = await db.query(
        "SELECT record FROM pi.conversations WHERE id = $1",
        [id],
      );
      return rows[0]?.record as ConversationRecord | undefined;
    },
    async scanConversations(query, limit, cursor) {
      await open();
      const { rows } = await db.query(
        `SELECT record FROM pi.conversations
         WHERE id > $1
           AND ($2::bigint IS NULL OR owner_conversation_id = $2)
           AND ($3::bigint IS NULL OR owner_task_id = $3)
         ORDER BY id LIMIT $4`,
        [
          cursor?.after ?? 0,
          query.ownerConversationId ?? null,
          query.ownerTaskId ?? null,
          limit + 1,
        ],
      );
      const items = rows
        .slice(0, limit)
        .map((row) => row.record as ConversationRecord);
      const next: Cursor | undefined =
        rows.length > limit ? { after: items.at(-1)!.id } : undefined;
      return next === undefined ? { items } : { items, next };
    },
    async close() {
      closed = true;
    },
    entry: notImplemented,
    findLatestHeadMarker: notImplemented,
    scanEntries: notImplemented,
    task: notImplemented,
    scanTasks: notImplemented,
    submission: notImplemented,
    scanSubmissions: notImplemented,
    submissionByRequest: notImplemented,
    findDocument: notImplemented,
    document: notImplemented,
    scanDocuments: notImplemented,
  };
}
