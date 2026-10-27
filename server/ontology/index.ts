/**
 * `@que/ontology`: que's harness words, as a basis schema: `harness` (harness.ts), which imports the plugin schema of
 * `@que/plugin`. Each type holds every field of a thing, defined once: a note and a definition in code are parsed with
 * it, and `@que/core` builds its specs from these types. Its imports end in `.ts`, so Node loads it with no build: lot's
 * lint imports it. The schema's type notes are in `types/harness/`.
 */

import { harness } from "./harness.ts";

export { harness };
