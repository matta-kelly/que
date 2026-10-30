/**
 * Thread records: what que keeps of each thread apart from its messages, one
 * row per thread in Postgres. A thread is read and listed only by its owner.
 */

import pg from "pg";

export type Thread = {
  id: string;
  /** The user's id (`User.id` in @que/users). */
  owner: string;
  createdAt: Date;
};

export type ThreadStore = {
  /** A new thread, owned by `owner`. */
  make(owner: string): Promise<Thread>;
  /** The thread, if `owner` owns it; for any other user, none. */
  get(owner: string, id: string): Promise<Thread | undefined>;
  /** The threads `owner` owns, and no other user's. */
  list(owner: string): Promise<Thread[]>;
  /** The thread's conversation, or none: a thread before its first run, or one made before B5. */
  conversationOf(id: string): Promise<string | null>;
  /** Points the thread at its conversation. */
  setConversation(id: string, conversation: string): Promise<void>;
};

/** What the store runs its queries on: a pg pool, or anything with the same `query`. */
export type Queryable = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
};

/**
 * The table, made when it is not there. The id is text, so an id from a path
 * that is not a uuid finds no thread, and is not an error.
 */
export const SETUP = `
  CREATE TABLE IF NOT EXISTS threads (
    id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    owner      text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

/** The thread's conversation, added beside the table so one S1 made gets it. */
const ALTER = `ALTER TABLE threads ADD COLUMN IF NOT EXISTS conversation text`;

type Row = { id: string; owner: string; created_at: Date };
const toThread = (r: Row): Thread => ({
  id: r.id,
  owner: r.owner,
  createdAt: r.created_at,
});

export function createStore(
  databaseUrl = process.env.DATABASE_URL,
): ThreadStore {
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  // A connection that sits idle in the pool can still be lost (Postgres restarts, or the network drops). The pool
  // drops it and says so with an "error" event, which, with no listener, would end the process (node-postgres, Pool).
  pool.on("error", (error) =>
    console.error("que: an idle Postgres connection was lost:", error.message),
  );
  return storeOn(pool);
}

/** The store, on a database it sets up first (`SETUP`). */
export function storeOn(db: Queryable): ThreadStore {
  const ready = db.query(SETUP).then(() => db.query(ALTER));

  return {
    async make(owner) {
      await ready;
      const { rows } = await db.query(
        "INSERT INTO threads (owner) VALUES ($1) RETURNING *",
        [owner],
      );
      return toThread(rows[0]);
    },
    async get(owner, id) {
      await ready;
      const { rows } = await db.query(
        "SELECT * FROM threads WHERE owner = $1 AND id = $2",
        [owner, id],
      );
      return rows[0] && toThread(rows[0]);
    },
    async list(owner) {
      await ready;
      const { rows } = await db.query(
        "SELECT * FROM threads WHERE owner = $1 ORDER BY created_at",
        [owner],
      );
      return rows.map(toThread);
    },
    async conversationOf(id) {
      await ready;
      const { rows } = await db.query(
        "SELECT conversation FROM threads WHERE id = $1",
        [id],
      );
      return rows[0]?.conversation ?? null;
    },
    async setConversation(id, conversation) {
      await ready;
      await db.query("UPDATE threads SET conversation = $2 WHERE id = $1", [
        id,
        conversation,
      ]);
    },
  };
}
