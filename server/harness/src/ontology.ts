/**
 * que's harness ontology, as the specs read it: each field a definition holds of a thing is the field its type in the
 * harness schema (schema.ts) gives a node, defined there once. A spec adds what only code holds (a function, a zod schema).
 */

import type { Graph, Rule } from "@mku1tra/basis";
import type * as z from "zod";
import { harness } from "./schema.ts";

export const types = harness.types;

// A definition is checked alone, with no graph: a rule run on one reads no other node.
const none: Graph = { get: () => undefined, all: () => [] };

/** A refinement that gives each fault one rule finds in a definition as an issue on its field, beside its parse's. */
export const refineBy =
  (rule: Rule) => (value: unknown, ctx: z.RefinementCtx) => {
    for (const { field, message } of rule.check(value as never, none))
      ctx.addIssue({
        code: "custom",
        path: field ? field.slice(1).split("/") : [],
        message,
      });
  };

/** What one rule finds wrong with a value a definition holds, read as its node: `<field> <message>`, as `check` says it. */
export const ruleFaults = (rule: Rule, value: unknown): string[] =>
  rule
    .check(value as never, none)
    .map(({ field, message }) =>
      [field?.slice(1).replaceAll("/", "."), message].filter(Boolean).join(" "),
    );
