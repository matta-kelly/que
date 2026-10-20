/**
 * The shared contract every plugin is written against. Framework-free:
 * the harness turns definitions into its own tools and prompt.
 */

import * as z from "zod";
import { check, fn, name, named, once, text } from "./check.js";

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
  .object(
    {
      name,
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
      /** The names of its skills. Each one is a `skills/<name>/SKILL.md` in the plugin folder. */
      skills: z
        .array(name, { error: "must be an array" })
        .superRefine(once((skill) => skill)),
      capabilities: z
        .array(Capability, { error: "must be an array" })
        .superRefine(once((capability) => capability.name)),
    },
    { error: "no definition (default export)" },
  )
  .superRefine((definition, ctx) =>
    definition.ops.forEach((op, i) => {
      const tool = `${definition.name}_${op.name}`;
      if (tool.length > 64)
        ctx.addIssue({
          code: "custom",
          path: ["ops", i, "name"],
          message: `makes the tool name ${tool}, over 64 characters`,
        });
    }),
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

type Listed = "ops" | "skills" | "capabilities";

export function definePlugin<S extends z.ZodObject, Conn>(
  definition: Omit<PluginDefinition<S, Conn>, Listed> &
    Partial<Pick<PluginDefinition<S, Conn>, Listed>>,
): PluginDefinition<S, Conn> {
  return {
    ...definition,
    ops: definition.ops ?? [],
    skills: definition.skills ?? [],
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
  check(PluginDefinition, def, `package${named(def)} is invalid`);
}

/** The plugins a deployment or an agent lists, under `plugins` or its old name `packages`. */
export const pluginsOf = (config: {
  plugins?: string[];
  packages?: string[];
}): string[] => config.plugins ?? config.packages ?? [];

// The old names, from before "package" was "plugin". They go once cc uses the new ones.

/** @deprecated The old name of `PluginDefinition`. */
export const PackageDefinition = PluginDefinition;
/** @deprecated The old name of `PluginDefinition`. */
export type PackageDefinition<
  S extends z.ZodObject = z.ZodObject,
  Conn = unknown,
> = PluginDefinition<S, Conn>;
/** @deprecated The old name of `definePlugin`. */
export const definePackage = definePlugin;
/** @deprecated The old name of `validatePlugin`. */
export const validatePackage: typeof validatePlugin = validatePlugin;
