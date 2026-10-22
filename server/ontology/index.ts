/**
 * `@que/ontology`: que's words, as two basis schemas: `plugin` (plugin.ts),
 * and `harness` (harness.ts), which imports it.
 * A node carries its identity, its links, and a title where the spec has one (plugin, op,
 * skill, capability), and no more: its other fields and their values stay in the specs and
 * the code. Each link is a field named after the spec field it mirrors, and its comment says
 * what it holds. specs.test.ts holds the links and the specs to each other.
 * It is a package apart from `@que/core`, so code that imports the core does not load basis.
 * Its imports end in `.ts`, so Node loads it with no build: lot's lint imports it.
 * Each schema's type notes are in `types/<schema>/`.
 */

import { harness } from "./harness.ts";
import { plugin } from "./plugin.ts";

export { harness, plugin };
