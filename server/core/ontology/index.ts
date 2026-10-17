/**
 * `@que/core/ontology`: que's words, as one basis package. It has no types yet.
 * It sits apart from `@que/core`, so code that imports the core does not load basis.
 */

import { definePackage } from "basis";

export const que = definePackage({
  name: "que",
  description:
    "que's words: the things a deployment, an agent and a package are made of.",
  types: [],
  links: [],
});
