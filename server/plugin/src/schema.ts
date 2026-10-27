/**
 * The plugin schema: what a plugin is made of. A plugin, its ops, roles, skills and capabilities, and the cases that
 * prove a capability. Each field is defined here once: a note, a card and a definition in code are parsed with it. A
 * thing a plugin holds under its own name (an op, a role, a skill) is a node named `<plugin>-<name>` (names.ts).
 */

import {
  defineRule,
  defineSchema,
  defineType,
  manyOrNone,
  one,
  oneOrNone,
} from "@mku1tra/basis";
import { JsonSchema, text } from "./fields.ts";

const op = defineType({
  name: "op",
  description:
    "One operation a plugin exposes: a tool the model calls, which runs in que. `Op` in @mku1tra/que-plugin.",
  fields: {
    title: text,
    // The role whose login it runs with, when its plugin lists roles.
    role: oneOrNone(() => accessRole),
    // What it takes, as JSON Schema: the card writes it from the op's zod schema.
    input: JsonSchema,
  },
});

// Not "role": lot's it owns that name, for the job an agent takes.
const accessRole = defineType({
  name: "access-role",
  description:
    "One access level of an internal service, which que holds one login for. `AccessRole` in @mku1tra/que-plugin.",
  fields: {},
});

const skill = defineType({
  name: "skill",
  description:
    "The text part of a plugin, one `SKILL.md`. `Skill` in @mku1tra/que-plugin.",
  fields: { title: text },
});

const capability = defineType({
  name: "capability",
  description:
    "An outcome someone wants from a system: the unit of intent, and the unit that is proven. `Capability` in @mku1tra/que-plugin.",
  fields: { title: text },
});

const kase = defineType({
  name: "case",
  description:
    "One behaviour of one capability, which the eval runner runs with the model. `Case` in @mku1tra/que-plugin.",
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
    "One concern, in one folder: its ops, skills and capabilities, and the cases that prove them. `Plugin` in @mku1tra/que-plugin.",
  fields: {
    title: text,
    // The credential it needs, as JSON Schema, when it talks to a service.
    credential: JsonSchema.optional(),
    ops: manyOrNone(() => op),
    // Each folder under its skills/ with a SKILL.md, as Agent Plugins finds them.
    skills: manyOrNone(() => skill),
    capabilities: manyOrNone(() => capability),
    // The roles of an internal service.
    roles: manyOrNone(() => accessRole),
    // What a domain uses from connectors: their ops, and their skills.
    usesOps: manyOrNone(() => op),
    usesSkills: manyOrNone(() => skill),
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

// A plugin with roles gives every op one of them. A role an op names that its plugin does not list is no node, and
// basis/link reports it. The op is named as the plugin writes it: `ops.search`.
const opRole = defineRule({
  name: "op-role",
  description: "Each op of a plugin that lists roles names one of them.",
  on: pluginType,
  check: (node, graph) => {
    const own = (name: string) => name.slice(node.name.length + 1);
    const roles = node.roles ?? [];
    if (!roles.length) return [];
    const listed = roles.map(own).join(", ");
    return (node.ops ?? []).flatMap((name, i) => {
      const found = graph.get(name, op);
      // An op that is not a node, or did not parse, has that problem itself.
      return found && found.role === undefined
        ? [
            {
              field: `/ops/${i}`,
              message: `ops.${own(name)} names no role: the plugin lists roles (${listed}), so each op names one.`,
            },
          ]
        : [];
    });
  },
});

// What a plugin uses, op or skill, by the field that lists it.
const usesOf = (node: { usesOps?: string[]; usesSkills?: string[] }) => [
  ...(node.usesOps ?? []).map((name) => ({ name, field: "/usesOps" })),
  ...(node.usesSkills ?? []).map((name) => ({ name, field: "/usesSkills" })),
];

// Its own ops and skills are a plugin's already: what it uses is another plugin's.
const ownUse = defineRule({
  name: "own-use",
  description: "A plugin uses no op or skill of its own.",
  on: pluginType,
  check: (node) => {
    const own = new Set([...(node.ops ?? []), ...(node.skills ?? [])]);
    return usesOf(node)
      .filter(({ name }) => own.has(name))
      .map(({ name, field }) => ({
        field,
        message: `${name} is its own: a plugin uses only other plugins' ops and skills.`,
      }));
  },
});

// A plugin that uses others (a domain) uses only plugins that use none (connectors): so there are no chains and no
// cycles.
const connectorUse = defineRule({
  name: "connector-use",
  description:
    "A plugin uses only the ops and skills of a plugin that uses nothing.",
  on: pluginType,
  check: (node, graph) => {
    const plugins = graph.all(pluginType);
    return usesOf(node).flatMap(({ name, field }) => {
      const holder = plugins.find(
        (other) =>
          other.name !== node.name &&
          [...(other.ops ?? []), ...(other.skills ?? [])].includes(name),
      );
      return holder && usesOf(holder).length
        ? [
            {
              field,
              message: `${name} is ${holder.name}'s, and ${holder.name} uses other plugins' ops and skills: a plugin uses only the ops and skills of a plugin that uses nothing.`,
            },
          ]
        : [];
    });
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
  // From the package root, so the path is the same from src/ and from dist/.
  typeNotes: new URL("../types/", import.meta.url),
  rules: [toolName, opRole, ownUse, connectorUse],
});
