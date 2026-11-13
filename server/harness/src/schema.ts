/**
 * The harness schema of que's ontology: what runs plugins. A deployment, and the plugins it names. Its link points at
 * the plugin type of the plugin schema, which it imports. The type is the contract: a definition in code is parsed
 * with it (define.ts), and a note of the same name gives the prose.
 */

import { defineSchema, defineType, manyOrNone } from "@mku1tra/basis";
import { plugin } from "@mku1tra/que-plugin";

const deployment = defineType({
  name: "deployment",
  description:
    "The plugins one deployment serves, each by its name. `Deployment` in @mku1tra/que-harness.",
  fields: {
    /** Each by its name, the name of its npm package, found as Node finds an import from the deployment's folder. */
    plugins: manyOrNone(() => plugin.types.plugin),
  },
});

export const harness = defineSchema({
  name: "harness",
  description:
    "What runs que's plugins: a deployment, and the plugins it serves.",
  types: { deployment },
  imports: [plugin],
  typeNotes: new URL("../types/harness/", import.meta.url),
  // What the package exports, for basis/one-definition: each zod object in it is part of a type.
  exports: () => import("./index.ts"),
});
