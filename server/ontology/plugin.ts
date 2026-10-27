/**
 * The plugin schema of que's ontology: what a plugin is made of. A plugin,
 * its ops, skills and capabilities, and the cases that prove a capability.
 */

import {
  defineSchema,
  defineType,
  manyOrNone,
  one,
  oneOrNone,
} from "@mku1tra/basis";
import * as z from "zod";

// Blank text is no title, as the specs refuse it (`!value.trim()`). The value is kept as written.
const title = z.string().regex(/\S/, "text that is not blank");

const op = defineType({
  name: "op",
  description: "One operation a plugin exposes. `Operation` in plugin.ts.",
  fields: {
    title,
    // The role whose login it runs with. `Operation.role`.
    role: oneOrNone(() => accessRole),
  },
});

// Not "role": lot's it owns that name, for the job an agent takes.
const accessRole = defineType({
  name: "access-role",
  description:
    "One access level of an internal service, which que holds one login for. `Role` in plugin.ts.",
  fields: {},
});

const skill = defineType({
  name: "skill",
  description:
    "The text part of a plugin, one `SKILL.md`. `Skill` in skill.ts.",
  fields: { title },
});

const capability = defineType({
  name: "capability",
  description:
    "A capability is an outcome someone wants from a system: the unit of intent, and the unit that is proven. `Capability` in plugin.ts.",
  // It lives in a plugin's code, and a note describes it.
  described: true,
  fields: { title },
});

const pluginType = defineType({
  name: "plugin",
  description:
    "A set of ops, skills and capabilities. `PluginDefinition` in plugin.ts.",
  fields: {
    title,
    // The ops of a plugin. `PluginDefinition.ops`.
    ops: manyOrNone(() => op),
    // The skills of a plugin: each folder under its skills/ with a SKILL.md, as Agent Plugins finds them.
    skills: manyOrNone(() => skill),
    // The capabilities of a plugin. `PluginDefinition.capabilities`.
    capabilities: manyOrNone(() => capability),
    // The roles of an internal service. `PluginDefinition.roles`.
    roles: manyOrNone(() => accessRole),
    // What a domain uses from connectors, their ops and skills. `PluginDefinition.uses`.
    uses: manyOrNone(() => [op, skill] as const),
  },
});

const kase = defineType({
  name: "case",
  description: "One behaviour of one capability. `Case` in case.ts.",
  // It lives in a plugin's cases.ts, and a note describes it.
  described: true,
  fields: {
    // The capability a case is about. `Case.capability`.
    capability: one(() => capability),
  },
});

export const plugin = defineSchema({
  name: "plugin",
  description:
    "What a que plugin is made of: its ops, skills, capabilities and roles, and the cases of a capability.",
  types: {
    plugin: pluginType,
    op,
    "access-role": accessRole,
    skill,
    capability,
    case: kase,
  },
  typeNotes: new URL("./types/plugin/", import.meta.url),
});
