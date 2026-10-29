/**
 * pi's `Storage` on Postgres: its conversations and entries, and the commit, id and close they need.
 * Tasks, submissions and documents are not written yet.
 */

import type { Context } from "@earendil-works/chord/context";
import type {
  ConversationId,
  ConversationRecord,
  EntryId,
  Id,
  Seq,
  Storage,
} from "@earendil-works/pi-durable";
import {
  entry,
  findLatestHeadMarker,
  scanEntries,
  writeEntry,
} from "./entries.ts";
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

  // The operations run one at a time, so a read never runs inside an open commit's transaction.
  let last: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = last.then(operation);
    last = result.catch(() => {});
    return result;
  };

  return {
    // BEGIN and COMMIT make one transaction because the database is one connection: a client, not a pool.
    commit: (writes) =>
      inTurn(async () => {
        await open();
        await db.query("BEGIN");
        try {
          // The sequence first: each entry holds the sequence of the commit that wrote it.
          const { rows } = await db.query(
            "SELECT nextval('pi.commit_seqs') AS seq",
          );
          const seq = Number(rows[0].seq) as Seq;
          for (const write of writes) {
            if (write.type === "conversation") {
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
            } else if (write.type === "entry") {
              await writeEntry(db, write.value, seq);
            } else notImplemented();
            // A stored id the sequence has not reached moves it past that id, so mintId never gives it.
            await db.query(
              "SELECT setval('pi.ids', $1) FROM pi.ids WHERE $1 >= last_value + is_called::int",
              [write.value.id],
            );
          }
          await db.query("COMMIT");
          return seq;
        } catch (error) {
          await db.query("ROLLBACK");
          throw error;
        }
      }),
    mintId: <I extends Id<string>>() =>
      inTurn(async () => {
        await open();
        const { rows } = await db.query("SELECT nextval('pi.ids') AS id");
        return Number(rows[0].id) as I;
      }),
    conversation: (id) =>
      inTurn(async () => {
        await open();
        const { rows } = await db.query(
          "SELECT record FROM pi.conversations WHERE id = $1",
          [id],
        );
        return rows[0]?.record as ConversationRecord | undefined;
      }),
    scanConversations: (query, limit, cursor) =>
      inTurn(async () => {
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
        return rows.length > limit
          ? { items, next: { after: items.at(-1)!.id } }
          : { items };
      }),
    async close() {
      closed = true;
    },
    // Two forms: (id, context), or (conversationId, id, context) for an entry visible through that conversation.
    entry: (first: number, second: unknown, third?: Context) =>
      inTurn(async () => {
        await open();
        return third === undefined
          ? entry(db, first as EntryId)
          : entry(db, second as EntryId, first as ConversationId);
      }),
    findLatestHeadMarker: (conversationId, atOrBefore) =>
      inTurn(async () => {
        await open();
        return findLatestHeadMarker(db, conversationId, atOrBefore);
      }),
    scanEntries: (query, limit, cursor) =>
      inTurn(async () => {
        await open();
        return scanEntries(db, query, limit, cursor);
      }),
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
