/**
 * `@que/core/ontology`: que's words, as two basis schemas: `plugin` (plugin.ts),
 * and `harness` (harness.ts), which imports it.
 * A node carries its identity, its links, and a title where the spec has one (plugin, op,
 * skill, capability), and no more: its other fields and their values stay in the specs and
 * the code. Each link is a field named after the spec field it mirrors, and its comment says
 * what it holds. specs.test.ts holds the links and the specs to each other.
 * It sits apart from `@que/core`, so code that imports the core does not load basis.
 */

import { defineSchema } from "basis";
import { harness } from "./harness.js";
import { plugin } from "./plugin.js";

export { harness, plugin };

/**
 * @deprecated All nine types in one schema, as before the split: the same type
 * objects, not defined again. It goes once cc imports `plugin`.
 */
export const que = defineSchema({
  name: "que",
  description:
    "que's words: the things a deployment, an agent and a package are made of.",
  types: { ...plugin.types, ...harness.types },
});
