/**
 * Thread records: what que keeps of each thread apart from its messages, one
 * row per thread in Postgres. A thread is read and listed only by its owner.
 *
 * Stub: the interface only, for the tests to reach their assertions.
 */

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
};

/** What the store runs its queries on: a pg pool, or anything with the same `query`. */
export type Queryable = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
};

/** The store, on a database it sets up first. */
export function storeOn(db: Queryable): ThreadStore {
  void db;
  return {
    make: async () => ({ id: "", owner: "", createdAt: new Date(0) }),
    get: async () => undefined,
    list: async () => [],
  };
}
