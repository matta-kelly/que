/**
 * File storage: the bytes on disk under the data directory, one folder per
 * file id, and a row per file in Postgres. A file belongs to its thread, and
 * the uploaded name is kept in the row: it is never a path component.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
  query<Row = unknown>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
};

/**
 * The table, made when it is not there. The id is text, so an id from a path
 * that is not one finds no file, and is not an error.
 * One statement, so Postgres runs it in one transaction: the lock is taken
 * before the CREATE. The lock makes two que processes that start together
 * make the table one after the other, so the second finds it done.
 */
export const SETUP = `
  DO $$
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('que.files'));
    CREATE TABLE IF NOT EXISTS files (
      id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
      thread     text        NOT NULL,
      name       text        NOT NULL,
      mime_type  text        NOT NULL,
      size       integer     NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  END
  $$`;

type Row = {
  id: string;
  name: string;
  mime_type: string;
  size: number;
};

/** A uuid, as `randomUUID` makes one: the only id a file can have. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `value` is one path segment: not empty, and no folder in it, by either separator. */
function isSegment(value: string): boolean {
  return (
    value !== "" && value !== "." && value !== ".." && !/[/\\\0]/.test(value)
  );
}

/** Whether a thread and an id can name a file's folder: a thread is one segment, and an id is a uuid. */
function isFolder(thread: string, id: string): boolean {
  return isSegment(thread) && UUID.test(id);
}

/**
 * The folder a file's bytes and cached text are in. Only the id and the thread
 * name a path, and neither may climb out of `files`: a caller's string is never
 * joined before it is checked.
 */
function fileDir(dataDir: string, thread: string, id: string): string {
  if (!isFolder(thread, id)) {
    throw new Error(`not a file folder: ${thread}/${id}`);
  }
  return join(dataDir, "files", thread, id);
}

/** The store, on a database it sets up first (`SETUP`), with its bytes under `dataDir`. */
export function storeOn(db: Queryable, dataDir: string): FileStore {
  const ready = db.query(SETUP);
  const storedFile = (row: Row): StoredFile => ({
    id: row.id,
    name: row.name,
    mimeType: row.mime_type,
    size: row.size,
  });

  return {
    async put(thread, file) {
      await ready;
      const id = randomUUID();
      const dir = fileDir(dataDir, thread, id);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "file"), file.bytes);
      await db.query(
        "INSERT INTO files (id, thread, name, mime_type, size) VALUES ($1, $2, $3, $4, $5)",
        [id, thread, file.name, file.mimeType, file.bytes.length],
      );
      return {
        id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.bytes.length,
      };
    },

    async get(thread, id) {
      await ready;
      const { rows } = await db.query<Row>(
        "SELECT id, name, mime_type, size FROM files WHERE thread = $1 AND id = $2",
        [thread, id],
      );
      const row = rows[0];
      if (!row) return undefined;
      const bytes = await readFile(join(fileDir(dataDir, thread, id), "file"));
      return { ...storedFile(row), bytes };
    },

    async list(thread) {
      await ready;
      const { rows } = await db.query<Row>(
        "SELECT id, name, mime_type, size FROM files WHERE thread = $1 ORDER BY created_at",
        [thread],
      );
      return rows.map(storedFile);
    },

    async remove(thread, id) {
      await ready;
      if (!isFolder(thread, id)) return false;
      await rm(fileDir(dataDir, thread, id), { recursive: true, force: true });
      const { rows } = await db.query<{ id: string }>(
        "DELETE FROM files WHERE thread = $1 AND id = $2 RETURNING id",
        [thread, id],
      );
      return rows.length > 0;
    },
  };
}
