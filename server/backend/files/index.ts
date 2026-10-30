/**
 * File storage: the bytes on disk under the data directory, one folder per
 * file id, and a row per file in Postgres. A file belongs to its thread, and
 * the uploaded name is kept in the row: it is never a path component.
 */

export type StoredFile = {
  id: string;
  /** The uploaded name, as the user gave it. */
  name: string;
  mimeType: string;
  /** The bytes, in bytes. */
  size: number;
};

export type FileWithBytes = StoredFile & { bytes: Uint8Array };

/** A file to put: its name, its mime type, and its bytes. */
export type NewFile = {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
};

export type FileStore = {
  /** Keeps a new file for `thread`, and gives it: its generated id and its metadata. */
  put(thread: string, file: NewFile): Promise<StoredFile>;
  /** The file, if it belongs to `thread`; for any other thread, none. */
  get(thread: string, id: string): Promise<FileWithBytes | undefined>;
  /** The files `thread` holds, and no other thread's. */
  list(thread: string): Promise<StoredFile[]>;
  /** Deletes the file's row and its folder, if it belongs to `thread`: whether it did. */
  remove(thread: string, id: string): Promise<boolean>;
};

/** What the store runs its queries on: a pg pool, or anything with the same `query`. */
export type Queryable = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
};

/**
 * The table, made when it is not there. The id is text, so an id from a path
 * that is not one finds no file, and is not an error.
 */
export const SETUP = `
  CREATE TABLE IF NOT EXISTS files (
    id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    thread     text        NOT NULL,
    name       text        NOT NULL,
    mime_type  text        NOT NULL,
    size       integer     NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

/** The store, on a database it sets up first (`SETUP`), with its bytes under `dataDir`. */
export function storeOn(db: Queryable, dataDir: string): FileStore {
  const ready = db.query(SETUP);
  const notImplemented = (operation: string) => async (): Promise<never> => {
    await ready;
    void dataDir;
    throw new Error(`${operation} is not implemented`);
  };
  return {
    put: notImplemented("put"),
    get: notImplemented("get"),
    list: notImplemented("list"),
    remove: notImplemented("remove"),
  };
}
