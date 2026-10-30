/**
 * The plugin schema: what a plugin is made of. A plugin, its ops, roles, skills and capabilities, and the cases that
 * prove a capability. Each type is the contract: a definition in code is parsed with it (contract.ts), its live values
 * (an op's input and run, a plugin's credential, connect and whoami) too, and a note of the same name gives the prose.
 * Each thing has its real name, unique in the whole graph.
 */

import {
  defineRule,
  defineSchema,
  defineType,
  manyOrNone,
  type Graph,
  one,
  oneOrNone,
  type Type,
} from "@mku1tra/basis";
import * as z from "zod";
import { fn } from "./check.ts";
import { must, text } from "./fields.ts";

// A zod object, of zod or of zod/mini: both are of zod's core class, as basis reads one.
const isObject = (value: unknown): value is z.core.$ZodObject =>
  value instanceof z.core.$ZodObject;

// What the model reads to fill in an op's input: a zod object, each field described, that a model API takes as JSON
// Schema. A field's description is in zod's registry, where .describe() and zod/mini's .register() put it.
const input = z.custom<z.ZodObject>().superRefine((schema, ctx) => {
  if (!isObject(schema))
    return ctx.addIssue({ code: "custom", message: "must be a zod object" });
  for (const [field, value] of Object.entries(schema._zod.def.shape))
    if (!z.globalRegistry.get(value)?.description?.trim())
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: "has no description (add .describe())",
      });
  try {
    z.toJSONSchema(schema, { io: "input" });
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      message: `has no JSON Schema form (${(error as Error).message}): give it one that zod can write as JSON Schema`,
    });
  }
});

// A credential: a zod object of what a user gives to connect.
const credential = z
  .custom<z.ZodObject>()
  .refine(isObject, "must be a zod object");

const op = defineType({
  name: "op",
  description:
    "One operation a plugin exposes: a tool the model calls, which runs in que. `Op` in @mku1tra/que-plugin.",
  fields: {
    title: text,
    // The role whose login it runs with, when its plugin lists roles.
    role: oneOrNone(() => accessRole),
    input,
    // What it does: run(ctx, params). A connector op gets its connection in ctx, and a domain op the ops it uses.
    run: fn,
    // The ops it calls: a domain op's, each a connector's op. A connector op calls none.
    // The `(): Type` annotation stops the circular-initializer error (TS7022) that a link to op's own type gives.
    uses: manyOrNone((): Type => op),
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
  fields: {
    title: text,
    // The ops it uses: its frontmatter's allowed-tools, as the Agent Skills standard names them.
    uses: manyOrNone(() => op),
  },
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
    // What it touches: one service (a connector, when left out), or many, through the connectors (a domain).
    kind: z
      .enum(["connector", "domain"], { error: must('"connector" or "domain"') })
      .optional(),
    // When it talks to a service: the credential it needs, how it turns one into a connection, and who that is.
    credential: credential.optional(),
    connect: fn.optional(),
    whoami: fn.optional(),
    ops: manyOrNone(() => op),
    // Each folder under its skills/ with a SKILL.md, as Agent Plugins finds them.
    skills: manyOrNone(() => skill),
    capabilities: manyOrNone(() => capability),
    // The roles of an internal service.
    roles: manyOrNone(() => accessRole),
    // What a domain uses from connectors: their ops, made from its ops' and skills' uses when it is read (readPlugin) and
    // never written, and their skills.
    usesOps: manyOrNone(() => op),
    usesSkills: manyOrNone(() => skill),
    // The cases in its cases.ts, found by their file, as its skills are by their folders.
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

// A plugin with roles gives every op one of them, and an op names only a role its plugin lists. A role that is no node,
// basis/link reports, so each fault is reported once.
const opRole = defineRule({
  name: "op-role",
  description:
    "Each op of a plugin that lists roles names one of them, and an op names no role its plugin does not list.",
  on: pluginType,
  check: (node, graph) => {
    const roles = node.roles ?? [];
    const listed = roles.length
      ? `the plugin lists roles (${roles.join(", ")})`
      : "the plugin lists none";
    return (node.ops ?? []).flatMap((name, i) => {
      const found = graph.get(name, op);
      // An op that is not a node, or did not parse, has that problem itself.
      if (!found) return [];
      const field = `/ops/${i}`;
      if (found.role === undefined)
        return roles.length
          ? [
              {
                field,
                message: `${name} names no role: ${listed}, so each op names one.`,
              },
            ]
          : [];
      return !roles.includes(found.role) && graph.get(found.role, accessRole)
        ? [
            {
              field,
              message: `${name} names the role ${found.role}, which is not its plugin's: ${listed}.`,
            },
          ]
        : [];
    });
  },
});

// What a plugin uses, by the field that lists it, and the list of the plugin that holds it: each skill of its
// usesSkills, and each op its skills list. What its ops list, op-uses checks.
const usesOf = (
  node: { skills?: string[]; usesSkills?: string[] },
  graph: Graph,
) => [
  ...(node.usesSkills ?? []).map((name) => ({
    name,
    field: "/usesSkills",
    of: "skills" as const,
  })),
  ...(node.skills ?? []).flatMap((name, i) =>
    (graph.get(name, skill)?.uses ?? []).map((used) => ({
      name: used,
      field: `/skills/${i}`,
      of: "ops" as const,
    })),
  ),
];

// A domain reaches a service only through a connector's ops: the connection is the connector's. Each field it gives is
// said once.
const domainConnection = defineRule({
  name: "domain-connection",
  description:
    "A domain holds no connection: no credential, no connect, no whoami and no roles.",
  on: pluginType,
  check: (node) =>
    node.kind === "domain"
      ? [
          ["credential", node.credential !== undefined] as const,
          ["connect", node.connect !== undefined] as const,
          ["whoami", node.whoami !== undefined] as const,
          ["roles", !!node.roles?.length] as const,
        ]
          .filter(([, held]) => held)
          .map(([field]) => ({
            field: `/${field}`,
            message: `${node.name} is a domain, and gives ${field}: a domain holds no connection, it uses the connectors' ops.`,
          }))
      : [],
});

// What a plugin uses makes it a domain, and a domain says so: a plugin that leaves out its kind is a connector.
const domainUses = defineRule({
  name: "domain-uses",
  description:
    "Only a plugin that says kind domain lists the skills it uses (usesSkills).",
  on: pluginType,
  check: (node) =>
    node.kind !== "domain" && node.usesSkills?.length
      ? [
          {
            field: "/usesSkills",
            message: `${node.name} lists what it uses in usesSkills, and does not say kind "domain": a domain says its kind.`,
          },
        ]
      : [],
});

// Its own ops and skills are a plugin's already: what a domain uses is another plugin's. A connector's skill lists its
// own ops, which connector-use checks.
const ownUse = defineRule({
  name: "own-use",
  description: "A domain uses no op or skill of its own.",
  on: pluginType,
  check: (node, graph) =>
    node.kind === "domain"
      ? usesOf(node, graph)
          .filter(({ name, of }) => node[of]?.includes(name))
          .map(({ name, field }) => ({
            field,
            message: `${name} is its own: a plugin uses only other plugins' ops and skills.`,
          }))
      : [],
});

// A domain uses only connectors, and a connector's skill lists only its own ops: so there are no chains and no
// cycles. A name that is no op or skill, basis/link reports, so each fault is said once.
const connectorUse = defineRule({
  name: "connector-use",
  description:
    "A domain uses only connectors' ops and skills, and a connector's skill lists only its own ops.",
  on: pluginType,
  check: (node, graph) => {
    const plugins = graph.all(pluginType);
    return usesOf(node, graph).flatMap(({ name, field, of }) => {
      const holder = plugins.find(
        (other) => other.name !== node.name && other[of]?.includes(name),
      );
      if (!holder) return [];
      // A connector's usesSkills, domain-uses reports.
      if (node.kind !== "domain")
        return of === "ops"
          ? [
              {
                field,
                message: `${name} is ${holder.name}'s, and ${node.name} is a connector: a connector's skill lists only its own ops.`,
              },
            ]
          : [];
      return holder.kind === "domain"
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

// A connector's op stands alone, and a domain's op calls connectors' ops: so ops make no chains and no cycles. A name
// that is no op, basis/link reports, so each fault is said once.
const opUses = defineRule({
  name: "op-uses",
  description:
    "A connector's op uses no op, and a domain's op uses only connectors' ops.",
  on: pluginType,
  check: (node, graph) => {
    const plugins = graph.all(pluginType);
    return (node.ops ?? []).flatMap((name, i) => {
      const field = `/ops/${i}`;
      const uses = graph.get(name, op)?.uses ?? [];
      if (node.kind !== "domain")
        return uses.length
          ? [
              {
                field,
                message: `${name} uses ${uses.join(", ")}, and ${node.name} is a connector: a connector's op uses no op.`,
              },
            ]
          : [];
      return uses
        .filter(
          (used) =>
            plugins.find((other) => other.ops?.includes(used))?.kind ===
            "domain",
        )
        .map((used) => ({
          field,
          message: `${name} uses ${used}, which is a domain's op: a domain's op uses only connectors' ops.`,
        }));
    });
  },
});

// A case is about a capability of the plugin whose cases.ts holds it: the evals run it with that plugin. A capability
// that is no node, basis/link reports, so each fault is said once.
const caseCapability = defineRule({
  name: "case-capability",
  description:
    "Each case a plugin holds is about a capability the plugin lists.",
  on: pluginType,
  check: (node, graph) =>
    (node.cases ?? []).flatMap((name, i) => {
      const found = graph.get(name, kase);
      return found &&
        !(node.capabilities ?? []).includes(found.capability) &&
        graph.get(found.capability, capability)
        ? [
            {
              field: `/cases/${i}`,
              message: `${name} is about ${found.capability}, which ${node.name} does not list: a case is about a capability of the plugin that holds it.`,
            },
          ]
        : [];
    }),
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
  // What the package exports, for basis/one-definition: each zod object in it is part of a type, or a bridge.
  exports: () => import("./index.ts"),
  // The frontmatter of an Agent Skills SKILL.md: the standard's shape, which no type defines.
  bridges: ["SkillFrontmatter"],
  rules: [
    toolName,
    opRole,
    domainConnection,
    domainUses,
    ownUse,
    connectorUse,
    opUses,
    caseCapability,
  ],
});
