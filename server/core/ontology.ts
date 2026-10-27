/**
 * que's ontology, as the specs read it: each field a definition holds of a thing is the field its type in
 * `@que/ontology` gives a node, defined there once. A spec adds what only code holds (a function, a zod schema), and
 * the names a thing has in its plugin.
 */

import { lint, type Graph, type Rule, type Type } from "@mku1tra/basis";
import type * as z from "zod";
import { harness, plugin } from "@que/ontology";
import { NAMESPACE } from "@que/ontology/names";
import { nodesOfCard } from "@que/ontology/source";
import type { PluginDefinition } from "./plugin.js";

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

/**
 * What the plugin schema's rules find wrong with a definition and its skills, by their ids: its nodes, as its card
 * gives them (nodesOfCard), linted as the lint lints a plugin's card. Only the rules' problems: a link to another plugin's op is the deployment's to give.
 */
export function pluginFaults(
  definition: PluginDefinition,
  skills: readonly string[] = [],
): string[] {
  const card = {
    name: definition.name,
    description: definition.description,
    extensions: {
      [NAMESPACE]: {
        title: definition.title,
        ops: definition.ops.map(({ name, title, description, role }) => ({
          name,
          title,
          description,
          ...(role === undefined ? {} : { role }),
          input: {},
        })),
        roles: definition.roles,
        uses: definition.uses,
        capabilities: definition.capabilities,
        cases: [],
      },
    },
  };
  return lint(plugin, nodesOfCard(card, skills, "definition"))
    .filter((problem) => problem.rule?.startsWith(`${plugin.name}/`))
    .map((problem) => problem.message);
}

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
