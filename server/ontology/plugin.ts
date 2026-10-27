/**
 * The plugin schema of que's ontology: what a plugin is made of. A plugin,
 * its ops, roles, skills and capabilities, and the cases that prove a capability.
 * Each field is defined here once: a note, a card and a definition in code are parsed with it. A thing a plugin holds
 * under its own name (an op, a role, a skill) is a node named `<plugin>-<name>` (names.ts).
 */

import {
  defineRule,
  defineSchema,
  defineType,
  manyOrNone,
  one,
  oneOrNone,
} from "@mku1tra/basis";
import * as z from "zod";
import { text } from "./fields.ts";

/** A JSON Schema, as a card writes one: what a credential or an op's input takes. */
const jsonSchema = z.record(z.string(), z.unknown(), {
  error: "must be a JSON Schema object",
});

const op = defineType({
  name: "op",
  description:
    "One operation a plugin exposes: a tool the model calls, which runs in que. `Operation` in @que/core.",
  fields: {
    title: text,
    // The role whose login it runs with, when its plugin lists roles.
    role: oneOrNone(() => accessRole),
    // What it takes, as JSON Schema: the card writes it from the op's zod schema.
    input: jsonSchema,
  },
});

// Not "role": lot's it owns that name, for the job an agent takes.
const accessRole = defineType({
  name: "access-role",
  description:
    "One access level of an internal service, which que holds one login for. `Role` in @que/core.",
  fields: {},
});

const skill = defineType({
  name: "skill",
  description:
    "The text part of a plugin, one `SKILL.md`. `Skill` in @que/core.",
  fields: { title: text },
});

const capability = defineType({
  name: "capability",
  description:
    "An outcome someone wants from a system: the unit of intent, and the unit that is proven. `Capability` in @que/core.",
  fields: { title: text },
});

const kase = defineType({
  name: "case",
  description:
    "One behaviour of one capability, which the eval runner runs with the model. `Case` in @que/core.",
  fields: {
    // The capability it is about.
    capability: one(() => capability),
    // What the user says.
    input: text,
    // What is true before the run.
    start: text,
    // One statement that is true or false after the run.
    good: text,
  },
});

const pluginType = defineType({
  name: "plugin",
  description:
    "One concern, in one folder: its ops, skills and capabilities, and the cases that prove them. `PluginDefinition` in @que/core.",
  fields: {
    title: text,
    // The credential it needs, as JSON Schema, when it talks to a service.
    credential: jsonSchema.optional(),
    ops: manyOrNone(() => op),
    // Each folder under its skills/ with a SKILL.md, as Agent Plugins finds them.
    skills: manyOrNone(() => skill),
    capabilities: manyOrNone(() => capability),
    // The roles of an internal service.
    roles: manyOrNone(() => accessRole),
    // What a domain uses from connectors: their ops and skills.
    uses: manyOrNone(() => [op, skill] as const),
    // Its cases, in its cases.ts.
    cases: manyOrNone(() => kase),
  },
});

// Model APIs take a tool name of at most 64 characters, and an op's name is its tool name.
const toolName = defineRule({
  name: "tool-name",
  description: "An op's name, its tool name, is at most 64 characters.",
  on: op,
  check: (node) =>
    node.name.length > 64
      ? [
          {
            message: `${node.name}, its tool name, is ${node.name.length} characters: model APIs take at most 64.`,
          },
        ]
      : [],
});

// A plugin with roles gives every op one of them; a plugin with none gives none.
const opRole = defineRule({
  name: "op-role",
  description:
    "Each op of a plugin that lists roles names one of them, and each op of a plugin that lists none names none.",
  on: pluginType,
  check: (node, graph) => {
    const roles = node.roles ?? [];
    const listed = roles.join(", ");
    return (node.ops ?? []).flatMap((name) => {
      const found = graph.get(name, op);
      // An op that is not a node, or did not parse, has that problem itself.
      if (!found) return [];
      const role = found.role;
      const message =
        roles.length && role === undefined
          ? `${name} names no role: the plugin lists roles (${listed}), so each op names one.`
          : roles.length && role !== undefined && !roles.includes(role)
            ? `${name} names the role ${role}, which is not one of the plugin's (${listed}).`
            : !roles.length && role !== undefined
              ? `${name} names the role ${role}, and the plugin lists none.`
              : undefined;
      return message ? [{ field: "/ops", message }] : [];
    });
  },
});

// Its own ops and skills are a plugin's already: what it uses is another plugin's.
const ownUse = defineRule({
  name: "own-use",
  description: "A plugin uses no op or skill of its own.",
  on: pluginType,
  check: (node) => {
    const own = new Set([...(node.ops ?? []), ...(node.skills ?? [])]);
    return (node.uses ?? [])
      .filter((name) => own.has(name))
      .map((name) => ({
        field: "/uses",
        message: `${name} is its own: a plugin uses only other plugins' ops and skills.`,
      }));
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
  rules: [toolName, opRole, ownUse],
});
