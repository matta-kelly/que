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
  /** Whether its last run was stopped: set by a stop, cleared by its next run. */
  stopped: boolean;
  /** The user's title for it, or none. */
  title: string | null;
  archived: boolean;
  /** The agent config its runs take, by name, or none: the deployment's first. */
  agent: string | null;
  /** The model its runs take, by name, or none: its agent config's. */
  model: string | null;
};

export type ThreadStore = {
  /** A new thread, owned by `owner`, with the picks made before it was. */
  make(
    owner: string,
    pick?: Pick<ThreadChange, "agent" | "model">,
  ): Promise<Thread>;
  /** The thread, if `owner` owns it; for any other user, none. */
  get(owner: string, id: string): Promise<Thread | undefined>;
  /** The threads `owner` owns, and no other user's. */
  list(owner: string): Promise<Thread[]>;
  /** The thread's conversation, or none: a thread before its first run, or one made before B5. */
  conversationOf(id: string): Promise<string | null>;
  /** Every conversation the thread has been on: its own first, then the others, the one it was on last first. */
  conversationsOf(id: string): Promise<string[]>;
  /** Points the thread at its conversation, and keeps the one it was on among its others. */
  setConversation(id: string, conversation: string): Promise<void>;
  /** Says whether the thread's last run was stopped. */
  setStopped(id: string, stopped: boolean): Promise<void>;
  /** Changes the thread, if `owner` owns it, and gives it as changed; for any other user, none and no change. */
  change(
    owner: string,
    id: string,
    changes: ThreadChange,
  ): Promise<Thread | undefined>;
  /** Deletes the thread, if `owner` owns it: whether it did. */
  remove(owner: string, id: string): Promise<boolean>;
};

/** What a user changes of their thread: its title, whether it is archived, and its picks. */
export type ThreadChange = {
  title?: string;
  archived?: boolean;
  /** The agent config its runs take, by name; null follows the deployment. */
  agent?: string | null;
  /** The model its runs take, by name; null follows the agent config. */
  model?: string | null;
};

/** What the store runs its queries on: a pg pool, or anything with the same `query`. */
export type Queryable = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
};

/**
 * The columns added beside the table, so one an earlier version made gets them: the conversation, the stop, the
 * user's changes, and every conversation the thread has been on, in the order it was last on each.
 */
const ALTER = `ALTER TABLE threads
  ADD COLUMN IF NOT EXISTS conversation text,
  ADD COLUMN IF NOT EXISTS stopped boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS agent text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS conversations text[] NOT NULL DEFAULT '{}'`;

/** A row from before F3 keeps its conversation among the ones it has been on. */
const BACKFILL = `UPDATE threads SET conversations = ARRAY[conversation]
  WHERE conversation IS NOT NULL AND cardinality(conversations) = 0`;

/**
 * The table and its columns, made when they are not there, in one statement, so Postgres runs it in one transaction:
 * the lock makes two que processes that start together do it one after the other, so the second finds it done. The id
 * is text, so an id from a path that is not a uuid finds no thread, and is not an error.
 */
export const SETUP = `
  DO $$
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('que.threads'));
    CREATE TABLE IF NOT EXISTS threads (
      id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
      owner      text        NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    ${ALTER};
    ${BACKFILL};
  END
  $$`;

type Row = Omit<Thread, "createdAt"> & { created_at: Date };
const toThread = (r: Row): Thread => ({
  id: r.id,
  owner: r.owner,
  createdAt: r.created_at,
  stopped: r.stopped,
  title: r.title,
  archived: r.archived,
  agent: r.agent,
  model: r.model,
});

/** The columns a change may set: the keys of `ThreadChange`. */
const CHANGED = ["title", "archived", "agent", "model"] as const;

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
  const ready = db.query(SETUP);

  return {
    async make(owner, pick = {}) {
      await ready;
      const { rows } = await db.query(
        "INSERT INTO threads (owner, agent, model) VALUES ($1, $2, $3) RETURNING *",
        [owner, pick.agent ?? null, pick.model ?? null],
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
    async conversationsOf(id) {
      await ready;
      const { rows } = await db.query(
        "SELECT conversations FROM threads WHERE id = $1",
        [id],
      );
      return [
        ...((rows[0]?.conversations as string[] | undefined) ?? []),
      ].reverse();
    },
    async setConversation(id, conversation) {
      await ready;
      await db.query(
        `UPDATE threads SET conversation = $2,
           conversations = array_append(array_remove(conversations, $2), $2)
         WHERE id = $1`,
        [id, conversation],
      );
    },
    async change(owner, id, changes) {
      await ready;
      const set = CHANGED.filter((field) => changes[field] !== undefined);
      const { rows } = await db.query(
        `UPDATE threads SET ${[
          // A change of no field still answers whether the thread is the owner's.
          "id = id",
          ...set.map((field, i) => `${field} = $${i + 3}`),
        ].join(", ")} WHERE owner = $1 AND id = $2 RETURNING *`,
        [owner, id, ...set.map((field) => changes[field])],
      );
      return rows[0] && toThread(rows[0]);
    },
    async remove(owner, id) {
      await ready;
      const { rows } = await db.query(
        "DELETE FROM threads WHERE owner = $1 AND id = $2 RETURNING id",
        [owner, id],
      );
      return rows.length > 0;
    },
    async setStopped(id, stopped) {
      await ready;
      await db.query("UPDATE threads SET stopped = $2 WHERE id = $1", [
        id,
        stopped,
      ]);
    },
  };
}
