/**
 * The contract every plugin is written against: the plugin schema's types (schema.ts), and nothing beside them. Each
 * thing in code is its node: its real name, its type, and its fields, live values too. `definePlugin` parses a plugin
 * and what it holds with their types, once, and gives each as the node it is. Framework-free: the harness turns the
 * nodes into its own tools and prompt.
 */

import { markDefinition } from "@mku1tra/basis";
import type * as z from "zod";
import { faults, refuse } from "./check.ts";
import { plugin as schema } from "./schema.ts";

const types = schema.types;

/** The node of a type of the plugin schema, as its type parses it. */
export type NodeOf<T extends keyof typeof types> = z.output<
  (typeof types)[T]["schema"]
>;

/** The one failure type. Anything a plugin throws that isn't this is a bug. */
export class OpFailed extends Error {
  override name = "OpFailed";
}

/** A plugin's kind, as the plugin type says it: a connector, or a domain. */
type PluginKind = NonNullable<NodeOf<"plugin">["kind"]>;

/**
 * What an op's run gets, by its plugin's kind: a connector op gets its connection, and a domain op the ops it uses,
 * each by its name.
 */
type Context<Conn, K extends PluginKind> = K extends "domain"
  ? { ops: Record<string, (params: unknown) => Promise<unknown>> }
  : { conn: Conn };

/**
 * One operation a plugin exposes: an op node. Its name is its tool's name. `run` gets its context, by the kind of its
 * plugin (`K`), and the input.
 */
export type Op<
  Conn = unknown,
  S extends z.ZodObject = z.ZodObject,
  K extends PluginKind = "connector",
> = Omit<NodeOf<"op">, "input" | "run"> & {
  input: S;
  run(ctx: Context<Conn, K>, params: z.infer<S>): Promise<unknown>;
};

/** One outcome a plugin gives: a capability node. Its cases name it. */
export type Capability = NodeOf<"capability">;

/**
 * One access level of an internal service, which que holds one login for: an access-role node. A third-party service
 * enforces its own, so its plugin lists none.
 */
export type AccessRole = NodeOf<"access-role">;

/** Who a connection is logged in as, in that service (e.g. an Odoo user). */
export type ServiceIdentity = {
  id: string | number;
  name: string;
  email?: string;
};

/**
 * A plugin node. One that talks to a service gives the credential it needs (a zod object) and how to turn it into a
 * connection; a self-contained one leaves both out.
 */
export type Plugin<S extends z.ZodObject = z.ZodObject, Conn = unknown> = Omit<
  NodeOf<"plugin">,
  "credential" | "connect" | "whoami"
> & {
  credential?: S;
  connect?(credential: z.infer<S>): Promise<Conn>;
  /** Who the connection is logged in as. The harness tells the model, so "me"/"mine" resolve without asking. */
  whoami?(conn: Conn): Promise<ServiceIdentity>;
};

/** What a domain uses from connectors: their ops and skills, each by its name. */
export type Uses = Pick<NodeOf<"plugin">, "usesOps" | "usesSkills">;

/** A plugin and the nodes it holds: what `definePlugin` returns, and a plugin exports as its default. */
export type Definition<
  S extends z.ZodObject = z.ZodObject,
  Conn = unknown,
  K extends PluginKind = "connector",
> = {
  plugin: Plugin<S, Conn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ops: Op<Conn, any, K>[];
  roles: AccessRole[];
  capabilities: Capability[];
};

// The lists of a plugin node that name what it holds: definePlugin takes the nodes, and gives their names.
type Held = "ops" | "roles" | "capabilities";

type Kind = keyof typeof types;

// Each fault of a node, after its place in the definition: `ops.notes-search title is missing`.
const faultsOf = (at: string, type: Kind, node: unknown): string[] =>
  faults(types[type].schema, node).map((fault) =>
    [at, fault].filter(Boolean).join(" "),
  );

// A node held in a list, by its name when it has one, or its place.
const placeOf = (node: unknown, i: number) => {
  const name = (node as { name?: unknown } | undefined)?.name;
  return typeof name === "string" && name.trim() ? name : String(i);
};

// The faults of each node of a list, and the names it gives its plugin. A list that is not one gives no name.
function heldIn(list: unknown, field: Held, type: Kind) {
  if (!Array.isArray(list))
    return { names: [], faults: [`${field} must be an array`] };
  return {
    names: list.map((node, i) => placeOf(node, i)),
    faults: list.flatMap((node, i) =>
      faultsOf(`${field}.${placeOf(node, i)}`, type, node),
    ),
  };
}

// The lists of a plugin that its folder gives, not its code: its skills, by their folders, and its cases, by its
// cases.ts. A list given in code would be dropped for the folder's, so it is a fault.
const fromFolder = (plugin: unknown): string[] =>
  typeof plugin === "object" && plugin !== null
    ? [
        ...("skills" in plugin
          ? [
              "skills are found by folder, in skills/: a plugin's code gives none",
            ]
          : []),
        ...("cases" in plugin
          ? ["cases are found in cases.ts: a plugin's code gives none"]
          : []),
      ]
    : [];

/**
 * A plugin and the nodes it holds, each parsed with its type, once, and marked as the definition of its name and type
 * (basis's `markDefinition`); what holds them is no node, and is not marked. The plugin's lists of what it holds are
 * their names. Throws one error that lists every fault, each after the field it is in. Links and the plugin schema's
 * rules are the lint's: a definition is parsed alone, and what it names may be another's.
 */
export function definePlugin<
  S extends z.ZodObject,
  Conn,
  K extends PluginKind = "connector",
>(
  definition: Omit<Plugin<S, Conn>, Held | "skills" | "cases" | "kind"> & {
    kind?: K;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ops?: Op<Conn, any, K>[];
    roles?: AccessRole[];
    capabilities?: Capability[];
  },
): Definition<S, Conn, K> {
  const { ops = [], roles = [], capabilities = [], ...own } = definition;
  const held = {
    ops: heldIn(ops, "ops", "op"),
    roles: heldIn(roles, "roles", "access-role"),
    capabilities: heldIn(capabilities, "capabilities", "capability"),
  };
  const plugin = {
    ...own,
    ops: held.ops.names,
    roles: held.roles.names,
    capabilities: held.capabilities.names,
  };
  refuse(
    `plugin${typeof own.name === "string" ? ` ${own.name}` : ""} is invalid`,
    [
      ...fromFolder(own),
      ...faultsOf("", "plugin", plugin),
      ...held.ops.faults,
      ...held.roles.faults,
      ...held.capabilities.faults,
    ],
  );
  const node = <N extends { name: string; type: string }>(parsed: N): N =>
    markDefinition(parsed, { name: parsed.name, type: parsed.type });
  const parsed: Definition<S, Conn, K> = {
    plugin: node(types.plugin.schema.parse(plugin) as Plugin<S, Conn>),
    ops: ops.map((op) =>
      node(types.op.schema.parse(op) as Op<Conn, z.ZodObject, K>),
    ),
    roles: roles.map((role) => node(types["access-role"].schema.parse(role))),
    capabilities: capabilities.map((capability) =>
      node(types.capability.schema.parse(capability)),
    ),
  };
  return parsed;
}

/**
 * What a plugin's module gives as its default export, read as a definition: the plugin node and the nodes it holds,
 * each parsed with its type, or each fault, after its place. By its shape, not by which copy of this package made it:
 * a plugin may be made by another install of @mku1tra/que-plugin than the one that reads it.
 */
export function readDefinition(
  value: unknown,
): { definition: Definition; faults: [] } | { faults: string[] } {
  const given = value as Partial<Record<"plugin" | Held, unknown>> | null;
  if (typeof given !== "object" || given === null)
    return { faults: ["it is not what definePlugin gives"] };
  const lists = (["ops", "roles", "capabilities"] as const).map((field) =>
    heldIn(
      given[field],
      field,
      field === "ops" ? "op" : field === "roles" ? "access-role" : "capability",
    ),
  );
  const found = [
    ...fromFolder(given.plugin).map((fault) => `plugin ${fault}`),
    ...faultsOf("plugin", "plugin", given.plugin),
    ...lists.flatMap((list) => list.faults),
  ];
  if (found.length) return { faults: found };
  // The held nodes are the one source of the plugin's lists of them: a list the plugin node gives is theirs, or a fault.
  const plugin = given.plugin as Record<string, unknown>;
  const differ = (["ops", "roles", "capabilities"] as const).flatMap(
    (field, i) => {
      const held = lists[i].names;
      const named = (plugin[field] as string[] | undefined) ?? [];
      return named.join("\0") === held.join("\0")
        ? []
        : [
            `plugin.${field} names ${named.join(", ") || "none"}, and the definition holds ${held.join(", ") || "none"}`,
          ];
    },
  );
  if (differ.length) return { faults: differ };
  return {
    definition: {
      plugin: types.plugin.schema.parse({
        ...plugin,
        ops: lists[0].names,
        roles: lists[1].names,
        capabilities: lists[2].names,
      }) as Plugin,
      ops: (given.ops as unknown[]).map(
        (op) => types.op.schema.parse(op) as Op,
      ),
      roles: (given.roles as unknown[]).map((role) =>
        types["access-role"].schema.parse(role),
      ),
      capabilities: (given.capabilities as unknown[]).map((capability) =>
        types.capability.schema.parse(capability),
      ),
    },
    faults: [],
  };
}
