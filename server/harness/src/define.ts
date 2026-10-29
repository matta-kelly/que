/**
 * How code gives a node of the harness schema: `define<Type>` parses it with its type, once, and gives it as the node
 * it is, marked as the definition of its name and type (basis's `markDefinition`), so a lint of a package that exports
 * it fails it when no source gives a piece of it. Each type of the schema is the contract; a TypeScript type of its
 * node is its name in code.
 */

import { markDefinition } from "@mku1tra/basis";
import type * as z from "zod";
import { faults, refuse } from "@mku1tra/que-plugin";
import { harness } from "./schema.ts";

export const types = harness.types;

export type Kind = keyof typeof types;

/** The node of a type of the harness schema, as its type parses it. */
export type NodeOf<K extends Kind> = z.output<(typeof types)[K]["schema"]>;

// The fields of a kind that one piece of a node may leave to another: a model's facts are the model catalog's for a
// model it has an entry for (catalog.ts), so a model's file gives them only for one it has not. The node as a whole
// has each (basis/fields), and each from one piece (basis/merge).
const LEFT: { [K in Kind]?: { window: true } } = {
  model: { window: true },
};

/** A piece of a node of `kind`, as a file gives it: the node, with the fields another piece may give left optional. */
export type PieceOf<K extends Kind> = K extends "model"
  ? Omit<NodeOf<"model">, "window"> & Partial<Pick<NodeOf<"model">, "window">>
  : NodeOf<K>;

// The type of a piece of `kind`: its type, with the fields another piece may give left optional.
const pieceSchema = (kind: Kind): z.ZodType => {
  const left = LEFT[kind];
  const { schema } = types[kind];
  return left ? (schema as typeof types.model.schema).partial(left) : schema;
};

/**
 * A value read as a piece of a node of `kind`: parsed with its type, or each fault of it. By its shape, not by which
 * copy of this package made it: a deployment's files may be made by another install of @mku1tra/que-harness than the
 * one that reads them.
 */
export function readNode<K extends Kind>(
  kind: K,
  value: unknown,
): { node: PieceOf<K>; faults: [] } | { faults: string[] } {
  const schema = pieceSchema(kind);
  const found = faults(schema, value);
  return found.length
    ? { faults: found }
    : { node: schema.parse(value) as PieceOf<K>, faults: [] };
}

/**
 * The define function of a type: it parses a piece of a node with its type (readNode), and throws one error that lists
 * every fault. It gives the piece marked as the definition of its name and type.
 */
export const defineNode =
  <K extends Kind>(kind: K) =>
  (definition: PieceOf<K>): PieceOf<K> => {
    const name = (definition as { name?: unknown } | undefined)?.name;
    const read = readNode(kind, definition);
    refuse(
      `${kind}${typeof name === "string" && name.trim() ? ` ${name}` : ""} is invalid`,
      read.faults,
    );
    const { node } = read as { node: PieceOf<K> };
    return markDefinition(node, { name: node.name, type: node.type });
  };
