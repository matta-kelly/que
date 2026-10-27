/**
 * que's ontology, as the specs read it: each field a definition holds of a thing is the field its type in
 * `@que/ontology` gives a node, defined there once. A spec adds what only code holds (a function, a zod schema), and
 * the names a thing has in its plugin.
 */

import type { Type } from "@mku1tra/basis";
import { harness, plugin } from "@que/ontology";

export { nameIn } from "@que/ontology/names";

/** The fields a type gives a node beside its name, type and description: what a definition holds of the thing. */
export function fieldsOf<T extends Type>(
  type: T,
): Omit<T["schema"]["shape"], "name" | "type" | "description"> {
  return Object.fromEntries(
    Object.entries(type.schema.shape).filter(
      ([field]) => !["name", "type", "description"].includes(field),
    ),
  ) as Omit<T["schema"]["shape"], "name" | "type" | "description">;
}

export const types = { ...plugin.types, ...harness.types };
