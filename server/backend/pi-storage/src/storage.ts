/**
 * pi's `Storage` on Postgres. A stub: the signatures only, so the tests reach their assertions.
 */

import type { Seq, Storage } from "@earendil-works/pi-durable";

/** What the storage runs its queries on: a pg client, PGlite, or anything with the same `query`. */
export type Queryable = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
};

const notImplemented = (): never => {
  throw new Error("not implemented");
};

/** The storage, on a database it does not own: `close` releases the storage, and the caller closes the database. */
export function storageOn(db: Queryable): Storage {
  void db; // a stub: it runs no query yet
  return {
    async commit() {
      return undefined as unknown as Seq;
    },
    async mintId() {
      return undefined as never;
    },
    async conversation() {
      return undefined;
    },
    async scanConversations() {
      return { items: [] };
    },
    async close() {},
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
