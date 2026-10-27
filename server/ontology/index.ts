/**
 * `@que/ontology`: que's words, as two basis schemas: `plugin` (plugin.ts), and `harness` (harness.ts), which imports
 * it. Each type holds every field of a thing, defined once (fields.ts): a note, a card and a definition in code are
 * parsed with it, and `@que/core` builds its specs from these types, so the core depends on the ontology, and the
 * ontology on basis. `source.ts` reads plugins' cards into pieces of nodes, for basis's lint.
 * Its imports end in `.ts`, so Node loads it with no build: lot's lint imports it.
 * Each schema's type notes are in `types/<schema>/`.
 */

import { harness } from "./harness.ts";
import { plugin } from "./plugin.ts";

export { harness, plugin };
