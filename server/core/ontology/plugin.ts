/**
 * The plugin schema of que's ontology: what a package is made of. A package,
 * its ops, skills and capabilities, and the cases that prove a capability.
 */

import { defineSchema, defineType, manyOrNone, one } from "basis";
import * as z from "zod";

// Blank text is no title, as the specs refuse it (`!value.trim()`). The value is kept as written.
const title = z.string().regex(/\S/, "text that is not blank");

const op = defineType({
  name: "op",
  description: "One operation a package exposes. `Operation` in plugin.ts.",
  fields: { title },
});

const skill = defineType({
  name: "skill",
  description:
    "The text part of a package, one `SKILL.md`. `Skill` in skill.ts.",
  fields: { title },
});

const capability = defineType({
  name: "capability",
  description:
    "A capability is an outcome someone wants from a system: the unit of intent, and the unit that is proven. Its meaning is owned by the capability note (capability-model/_well/capability.md); this is that meaning as code. `Capability` in plugin.ts.",
  fields: { title },
});

const pkg = defineType({
  name: "package",
  description:
    "A set of ops, skills and capabilities. `PackageDefinition` in plugin.ts.",
  fields: {
    title,
    // The ops of a package. `PackageDefinition.ops`.
    ops: manyOrNone(() => op),
    // The skills of a package. `PackageDefinition.skills`.
    skills: manyOrNone(() => skill),
    // The capabilities of a package. `PackageDefinition.capabilities`.
    capabilities: manyOrNone(() => capability),
  },
});

const kase = defineType({
  name: "case",
  description: "One behaviour of one capability. `Case` in case.ts.",
  fields: {
    // The capability a case is about. `Case.capability`.
    capability: one(() => capability),
  },
});

export const plugin = defineSchema({
  name: "plugin",
  description:
    "What a que package is made of: its ops, skills and capabilities, and the cases of a capability.",
  types: {
    package: pkg,
    op,
    skill,
    capability,
    case: kase,
  },
});
