/**
 * The shared contract every plugin is written against. Framework-free:
 * the harness turns definitions into its own tools and prompt.
 */

import * as z from "zod";
import {
  check,
  fn,
  name,
  named,
  once,
  standardName,
  strict,
  text,
} from "./check.js";

export { NAME } from "./check.js";

/** The one failure type. Anything a plugin throws that isn't this is a bug. */
export class OperationFailed extends Error {
  override name = "OperationFailed";
}

/** One operation a plugin exposes. Becomes a tool. */
export const Operation = z.object({
  name,
  title: text,
  description: text,
  // The model reads each field's description to fill it in.
  schema: z.custom<z.ZodObject>().superRefine((schema, ctx) => {
    if (!(schema instanceof z.ZodObject))
      return ctx.addIssue({ code: "custom", message: "must be a zod object" });
    for (const [field, value] of Object.entries(
      schema.shape as Record<string, z.ZodType>,
    ))
      if (!value.description?.trim())
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "has no description (add .describe())",
        });
  }),
  run: fn,
  // The role whose login it runs with, when its plugin lists roles: one of them.
  role: standardName.optional(),
});

export type Operation<Conn = unknown, S extends z.ZodType = z.ZodType> = Omit<
  z.infer<typeof Operation>,
  "schema" | "run"
> & {
  schema: S;
  run(ctx: { conn: Conn }, params: z.infer<S>): Promise<unknown>;
};

/** One outcome a plugin gives. Its cases name it. */
export const Capability = z.object({
  name,
  title: text,
  description: text,
});

export type Capability = z.infer<typeof Capability>;

/**
 * One access level of an internal service, which que holds one login for (warehouse `read`, `write`).
 * A third-party service enforces its own, so its plugin lists none.
 */
export const Role = z.object({
  name: standardName,
  description: text,
});

export type Role = z.infer<typeof Role>;

// How a domain names what it uses: an op by its tool name, `<plugin>_<op>`, and a skill by its id, `<plugin>/<skill>`.
// A plugin's name has no `_` (standardName), so a tool name splits at its first one.
const PLUGIN = "[a-z0-9]+(?:-[a-z0-9]+)*";
const opRef = text.regex(new RegExp(`^${PLUGIN}_[a-zA-Z0-9_-]+$`), {
  error: ({ input }) =>
    `must be a tool name, <plugin>_<op>, got ${JSON.stringify(input)}`,
});
const skillRef = text.regex(new RegExp(`^${PLUGIN}/${PLUGIN}$`), {
  error: ({ input }) =>
    `must be a skill id, <plugin>/<skill>, got ${JSON.stringify(input)}`,
});

/** What a domain uses from connectors: their ops and skills, by name. Mount resolves each one. */
export const Uses = z.strictObject(
  {
    ops: z
      .array(opRef, { error: "must be an array" })
      .superRefine(once((op) => op)),
    skills: z
      .array(skillRef, { error: "must be an array" })
      .superRefine(once((skill) => skill)),
  },
  strict(),
);

export type Uses = z.infer<typeof Uses>;

/** Who a connection is logged in as, in that service (e.g. an Odoo user). */
export type ServiceIdentity = {
  id: string | number;
  name: string;
  email?: string;
};

/**
 * What `definePlugin` returns, and a plugin exports as its default.
 * Plugins that talk to a service declare the credential they need (a zod
 * object) and how to turn it into a connection; self-contained plugins leave
 * both out.
 */
export const PluginDefinition = z
  .strictObject(
    {
      // Its name in the open standard (`plugin.json`), and the start of each of its tool names.
      name: standardName,
      title: text,
      description: text,
      credential: z
        .custom<z.ZodObject>()
        .refine(
          (credential) => credential instanceof z.ZodObject,
          "must be a zod object",
        )
        .optional(),
      connect: fn.optional(),
      whoami: fn.optional(),
      ops: z
        .array(Operation, { error: "must be an array" })
        .superRefine(once((op) => op.name)),
      capabilities: z
        .array(Capability, { error: "must be an array" })
        .superRefine(once((capability) => capability.name)),
      roles: z
        .array(Role, { error: "must be an array" })
        .superRefine(once((role) => role.name)),
      uses: Uses,
    },
    strict(
      {
        skills:
          '"skills" is gone: each folder under skills/ with a SKILL.md is a skill, as Agent Plugins finds them',
      },
      "no definition (default export)",
    ),
  )
  .superRefine((definition, ctx) => {
    // Its own ops and skills are its already: a name it uses is another plugin's.
    const own = (ref: string, sep: string) =>
      ref.startsWith(definition.name + sep);
    definition.uses.ops.forEach((ref, i) => {
      if (own(ref, "_"))
        ctx.addIssue({
          code: "custom",
          path: ["uses", "ops", i],
          message: `names its own op ${ref}: a plugin uses only other plugins' ops`,
        });
    });
    definition.uses.skills.forEach((ref, i) => {
      if (own(ref, "/"))
        ctx.addIssue({
          code: "custom",
          path: ["uses", "skills", i],
          message: `names its own skill ${ref}: a plugin uses only other plugins' skills`,
        });
    });
    const roles = definition.roles.map((role) => role.name);
    definition.ops.forEach((op, i) => {
      const tool = `${definition.name}_${op.name}`;
      if (tool.length > 64)
        ctx.addIssue({
          code: "custom",
          path: ["ops", i, "name"],
          message: `makes the tool name ${tool}, over 64 characters`,
        });
      // A plugin with roles gives every op one of them; a plugin with none gives none.
      const path = ["ops", i, "role"];
      if (roles.length && op.role === undefined)
        ctx.addIssue({
          code: "custom",
          path,
          message: `is missing: the plugin lists roles (${roles.join(", ")}), so each op names one`,
        });
      else if (roles.length && !roles.includes(op.role ?? ""))
        ctx.addIssue({
          code: "custom",
          path,
          message: `must be one of the plugin's roles (${roles.join(", ")}), got ${JSON.stringify(op.role)}`,
        });
      else if (!roles.length && op.role !== undefined)
        ctx.addIssue({
          code: "custom",
          path,
          message: `names the role ${JSON.stringify(op.role)}, and the plugin lists none`,
        });
    });
  });

export type PluginDefinition<
  S extends z.ZodObject = z.ZodObject,
  Conn = unknown,
> = Omit<
  z.infer<typeof PluginDefinition>,
  "credential" | "connect" | "whoami" | "ops"
> & {
  credential?: S;
  connect?(credential: z.infer<S>): Promise<Conn>;
  /** Who the connection is logged in as. The harness tells the model, so "me"/"mine" resolve without asking. */
  whoami?(conn: Conn): Promise<ServiceIdentity>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ops: Operation<Conn, any>[];
};

type Listed = "ops" | "capabilities" | "roles";

export function definePlugin<S extends z.ZodObject, Conn>(
  definition: Omit<PluginDefinition<S, Conn>, Listed | "uses"> &
    Partial<Pick<PluginDefinition<S, Conn>, Listed>> & {
      uses?: Partial<Uses>;
    },
): PluginDefinition<S, Conn> {
  return {
    ...definition,
    ops: definition.ops ?? [],
    roles: definition.roles ?? [],
    uses: {
      ops: definition.uses?.ops ?? [],
      skills: definition.uses?.skills ?? [],
    },
    capabilities: definition.capabilities ?? [],
  };
}

/**
 * Check a definition against the contract, throwing one error that lists
 * every problem. Types can't catch these: a plugin is loaded at runtime, and
 * names, titles and descriptions are what the model reads.
 */
export function validatePlugin(
  def: PluginDefinition | undefined,
): asserts def is PluginDefinition {
  check(PluginDefinition, def, `plugin${named(def)} is invalid`);
}
