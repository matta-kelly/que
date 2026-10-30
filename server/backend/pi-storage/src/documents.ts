/**
 * pi's documents on Postgres. Not written yet: a document write stores nothing, and the reads find nothing.
 * The stubs are the interface only, so the storage's document cases reach their assertions.
 */

import type {
  Cursor,
  DocumentAddress,
  DocumentId,
  DocumentPoint,
  DocumentQuery,
  DocumentRecord,
  Page,
  StorageWrite,
  StoredDocument,
} from "@earendil-works/pi-durable";
import type { Queryable } from "./storage.ts";

/** One document write: a create, a copy, a change, or a retire. */
export type DocumentWrite = Extract<
  StorageWrite,
  { readonly type: `document.${string}` }
>;

export async function writeDocument(
  _db: Queryable,
  _write: DocumentWrite,
): Promise<void> {
  return;
}

export async function findDocument(
  _db: Queryable,
  _address: DocumentAddress,
  _at: DocumentPoint,
): Promise<DocumentRecord | undefined> {
  return undefined;
}

export async function document(
  _db: Queryable,
  _id: DocumentId,
  _at: DocumentPoint,
): Promise<StoredDocument | undefined> {
  return undefined;
}

export async function scanDocuments(
  _db: Queryable,
  _query: DocumentQuery,
  _limit: number,
  _cursor: Cursor | undefined,
): Promise<Page<DocumentRecord, Cursor>> {
  return { items: [] };
}
