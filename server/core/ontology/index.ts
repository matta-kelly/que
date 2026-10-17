/**
 * `@que/core/ontology`: que's words, as one basis package.
 * A node carries its identity and its links, and no more: its fields and their values
 * stay in the specs and the code. Each link is named after the spec field it mirrors.
 * It sits apart from `@que/core`, so code that imports the core does not load basis.
 */

import { defineLink, definePackage, defineType } from "basis";
import * as z from "zod";

const title = z.string().min(1);

const op = defineType({
  name: "op",
  description:
    "One operation a package exposes. `Operation` in package-spec.ts.",
  properties: { title },
});

const skill = defineType({
  name: "skill",
  description:
    "The text part of a package, one `SKILL.md`. `Skill` in skill-spec.ts.",
  properties: { title },
});

const capability = defineType({
  name: "capability",
  description: "One outcome a package gives. `Capability` in package-spec.ts.",
  properties: { title },
});

const pkg = defineType({
  name: "package",
  description:
    "A set of ops, skills and capabilities. `PackageDefinition` in package-spec.ts.",
  properties: { title },
});

const kase = defineType({
  name: "case",
  description: "One behaviour of one capability. `Case` in case-spec.ts.",
  properties: {},
});

export const que = definePackage({
  name: "que",
  description:
    "que's words: the things a deployment, an agent and a package are made of.",
  types: [pkg, op, skill, capability, kase],
  links: [
    defineLink({
      name: "ops",
      description: "The ops of a package. `PackageDefinition.ops`.",
      from: pkg,
      to: op,
      cardinality: "many",
      required: false,
    }),
    defineLink({
      name: "skills",
      description: "The skills of a package. `PackageDefinition.skills`.",
      from: pkg,
      to: skill,
      cardinality: "many",
      required: false,
    }),
    defineLink({
      name: "capabilities",
      description:
        "The capabilities of a package. `PackageDefinition.capabilities`.",
      from: pkg,
      to: capability,
      cardinality: "many",
      required: false,
    }),
    defineLink({
      name: "capability",
      description: "The capability a case is about. `Case.capability`.",
      from: kase,
      to: capability,
      cardinality: "one",
    }),
  ],
});
