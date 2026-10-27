/**
 * The shared contract every plugin is written against. Framework-free:
 * the harness turns definitions into its own tools and prompt.
 */

import * as z from "zod";
import { fn, once, strict } from "./check.ts";
import { fieldsOf, standardName, text } from "./fields.ts";
import { plugin } from "./schema.ts";

const types = plugin.types;

/** The one failure type. Anything a plugin throws that isn't this is a bug. */
export class OperationFailed extends Error {
  override name = "OperationFailed";
}

/** One operation a plugin exposes. Becomes a tool, named `<plugin>-<op>` (nameIn), which is also its node's name. */
export const Operation = z.object({
  /** Its name in its plugin. */
  name: standardName,
  title: fieldsOf(types.op).title,
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
  // The role whose login it runs with, when its plugin lists roles: one of them, by its name in the plugin.
  role: standardName.optional(),
});

export type Operation<Conn = unknown, S extends z.ZodType = z.ZodType> = Omit<
  z.infer<typeof Operation>,
  "schema" | "run"
> & {
  schema: S;
  run(ctx: { conn: Conn }, params: z.infer<S>): Promise<unknown>;
};

/** One outcome a plugin gives. Its cases name it, and its name is its node's, in the whole graph. */
export const Capability = z.object({
  name: standardName,
  ...fieldsOf(types.capability),
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

/**
 * What a domain uses from connectors: their ops and skills, each by its name in the graph, `<plugin>-<name>` (nameIn):
 * an op's tool name, and a skill's id. Mount resolves each one.
 */
export const Uses = z.strictObject(
  {
    ops: z
      .array(standardName, { error: "must be an array" })
      .superRefine(once((op) => op)),
    skills: z
      .array(standardName, { error: "must be an array" })
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
export const PluginDefinition = z.strictObject(
  {
    // Its name in the open standard (`plugin.json`), and the start of each of its tool names.
    name: standardName,
    title: fieldsOf(types.plugin).title,
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
);

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
