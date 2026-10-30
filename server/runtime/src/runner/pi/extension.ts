/**
 * que's catalog as a pi Extension, for one user: each op a tool whose run is one call to the door, as that user, and
 * each skill read by its tool. Every op is offered from the first request.
 */

import type { Extension } from "@earendil-works/pi-durable";
import type { Catalog } from "../../access/catalog.js";
import type { Call } from "../../assemble/door.js";

export function extension(
  catalog: Catalog,
  call: Call,
  user: string,
): Extension {
  void catalog;
  void call;
  void user;
  // Not built yet: an extension with no tools.
  return { name: "que" };
}
