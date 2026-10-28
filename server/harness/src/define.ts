/**
 * How code gives a node of the harness schema: `define<Type>` parses it with its type, once, and gives it as the node
 * it is. Each type of the schema is the contract; a TypeScript type of its node is its name in code.
 */

import type * as z from "zod";
import { faults, refuse } from "@mku1tra/que-plugin";
import { harness } from "./schema.ts";

export const types = harness.types;

export type Kind = keyof typeof types;

/** The node of a type of the harness schema, as its type parses it. */
export type NodeOf<K extends Kind> = z.output<(typeof types)[K]["schema"]>;

/**
 * A value read as a node of `kind`: parsed with its type, or each fault of it. By its shape, not by which copy of
 * this package made it: a deployment's files may be made by another install of @mku1tra/que-harness than the one that
 * reads them.
 */
export function readNode<K extends Kind>(
  kind: K,
  value: unknown,
): { node: NodeOf<K>; faults: [] } | { faults: string[] } {
  const found = faults(types[kind].schema, value);
  return found.length
    ? { faults: found }
    : { node: types[kind].schema.parse(value) as NodeOf<K>, faults: [] };
}

/** The define function of a type: it parses a node with its type, and throws one error that lists every fault. */
export const defineNode =
  <K extends Kind>(kind: K) =>
  (definition: NodeOf<K>): NodeOf<K> => {
    const name = (definition as { name?: unknown } | undefined)?.name;
    const read = readNode(kind, definition);
    refuse(
      `${kind}${typeof name === "string" && name.trim() ? ` ${name}` : ""} is invalid`,
      read.faults,
    );
    return (read as { node: NodeOf<K> }).node;
  };
