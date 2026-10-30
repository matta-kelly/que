/** The order and the position of a scan, from its query and its cursor, as pi's `MemoryStorage` reads them. */

import {
  StorageRequestError,
  type Cursor,
  type Page,
  type ScanOrder,
} from "@earendil-works/pi-durable";

/**
 * A scan's order and the id it continues after. A cursor continues in the order it was made with; a query that asks
 * for the other order throws. A cursor with no order continues in the scan's default. An order, or a cursor, that is
 * not one throws (pi's `scanStart`).
 */
export function scanStart(
  requested: ScanOrder | undefined,
  cursor: Cursor | undefined,
  fallback: ScanOrder,
): { order: ScanOrder; after?: number } {
  if (requested !== undefined && !isOrder(requested))
    throw new StorageRequestError(`Invalid scan order: ${String(requested)}`);
  if (cursor === undefined) return { order: requested ?? fallback };
  const { after, order: stored } = cursor;
  if (
    typeof after !== "number" ||
    !Number.isSafeInteger(after) ||
    (stored !== undefined && !isOrder(stored))
  )
    throw new StorageRequestError("Invalid storage cursor");
  const order = stored ?? fallback;
  if (requested !== undefined && requested !== order)
    throw new StorageRequestError(
      `The cursor continues a ${order} scan; the query asks for ${requested}`,
    );
  return { order, after };
}

const isOrder = (value: unknown): value is ScanOrder =>
  value === "ascending" || value === "descending";

/** The id bound and direction of an ordered scan: it moves away from the cursor on its own side. */
export function scanSql({ order, after }: { order: ScanOrder; after?: number }): {
  direction: "ASC" | "DESC";
  clause: string;
  param: number;
} {
  const descending = order === "descending";
  return {
    direction: descending ? "DESC" : "ASC",
    clause: descending ? "id < $1" : "id > $1",
    param: after ?? (descending ? Number.MAX_SAFE_INTEGER : 0),
  };
}

/** A page of the first `limit` items, with the cursor that continues it when a row remains. */
export function page<T extends { readonly id: number }>(
  items: T[],
  more: boolean,
  order: ScanOrder,
): Page<T, Cursor> {
  return more
    ? { items, next: { after: items.at(-1)!.id, order } }
    : { items };
}
