/**
 * The shared contract every package is written against. Framework-free:
 * the harness turns definitions into its own tools and prompt.
 */

import * as z from "zod";

/** The one failure type. Anything a package throws that isn't this is a bug. */
export class OperationFailed extends Error {
  override name = "OperationFailed";
}

/** One operation a package exposes. Becomes a tool. */
export type Operation<Conn = unknown, S extends z.ZodType = z.ZodType> = {
  name: string;
  title: string;
  description: string;
  schema: S;
  run(ctx: { conn: Conn }, params: z.infer<S>): Promise<unknown>;
};

/** One outcome a package gives. Its cases name it. */
export type Capability = {
  name: string;
  title: string;
  description: string;
};

/**
 * What `definePackage` returns, and a package exports as its default.
 * Packages that talk to a service declare the credential they need (a zod
 * object) and how to turn it into a connection; self-contained packages leave
 * both out.
 */
/** Who a connection is logged in as, in that service (e.g. an Odoo user). */
export type ServiceIdentity = {
  id: string | number;
  name: string;
  email?: string;
};

export type PackageDefinition<
  S extends z.ZodObject = z.ZodObject,
  Conn = unknown,
> = {
  name: string;
  title: string;
  description: string;
  credential?: S;
  connect?(credential: z.infer<S>): Promise<Conn>;
  /** Who the connection is logged in as. The harness tells the model, so "me"/"mine" resolve without asking. */
  whoami?(conn: Conn): Promise<ServiceIdentity>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ops: Operation<Conn, any>[];
  /** The names of its skills. Each one is a `skills/<name>/SKILL.md` in the package folder. */
  skills: string[];
  capabilities: Capability[];
};

type Listed = "ops" | "skills" | "capabilities";

export function definePackage<S extends z.ZodObject, Conn>(
  definition: Omit<PackageDefinition<S, Conn>, Listed> &
    Partial<Pick<PackageDefinition<S, Conn>, Listed>>,
): PackageDefinition<S, Conn> {
  return {
    ...definition,
    ops: definition.ops ?? [],
    skills: definition.skills ?? [],
    capabilities: definition.capabilities ?? [],
  };
}

// What model APIs allow in a tool name. The harness names each tool
// `<package>_<op>`, so the combined name must fit too.
export const NAME = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Check a definition against the contract, throwing one error that lists
 * every problem. Types can't catch these: a package is loaded at runtime, and
 * names, titles and descriptions are what the model reads.
 */
export function validatePackage(
  def: PackageDefinition | undefined,
): asserts def is PackageDefinition {
  if (!def || typeof def !== "object")
    throw new Error("package: no definition (default export)");
  const problems: string[] = [];
  const text = (value: unknown, what: string) => {
    if (typeof value !== "string" || !value.trim())
      problems.push(`${what} is missing`);
  };
  const pkg = def.name || "(unnamed)";

  text(def.name, "package name");
  if (typeof def.name === "string" && !NAME.test(def.name))
    problems.push(`package name "${def.name}" must match ${NAME}`);
  text(def.title, `title of package ${pkg}`);
  text(def.description, `description of package ${pkg}`);
  if (!Array.isArray(def.ops))
    problems.push(`ops of package ${pkg} must be an array`);

  const seen = new Set<string>();
  for (const op of Array.isArray(def.ops) ? def.ops : []) {
    const id = `${pkg}.${op.name}`;
    text(op.name, `name of an op in package ${pkg}`);
    if (typeof op.name === "string") {
      if (!NAME.test(op.name))
        problems.push(`op name "${id}" must match ${NAME}`);
      if (`${def.name}_${op.name}`.length > 64)
        problems.push(
          `tool name "${def.name}_${op.name}" is over 64 characters`,
        );
      if (seen.has(op.name)) problems.push(`op name "${id}" is used twice`);
      seen.add(op.name);
    }
    text(op.title, `title of op ${id}`);
    text(op.description, `description of op ${id}`);
    if (!(op.schema instanceof z.ZodObject)) {
      problems.push(`schema of op ${id} must be a zod object`);
      continue;
    }
    for (const [field, schema] of Object.entries(
      op.schema.shape as Record<string, z.ZodType>,
    )) {
      if (!schema.description?.trim())
        problems.push(
          `field ${id}.${field} has no description (add .describe())`,
        );
    }
  }

  if (!Array.isArray(def.skills))
    problems.push(`skills of package ${pkg} must be an array`);
  const skills = new Set<string>();
  for (const name of Array.isArray(def.skills) ? def.skills : []) {
    const id = `${pkg}/${name}`;
    if (typeof name !== "string" || !NAME.test(name))
      problems.push(`skill name "${id}" must match ${NAME}`);
    if (skills.has(name)) problems.push(`skill name "${id}" is used twice`);
    skills.add(name);
  }

  if (!Array.isArray(def.capabilities))
    problems.push(`capabilities of package ${pkg} must be an array`);
  const capabilities = new Set<string>();
  for (const capability of Array.isArray(def.capabilities)
    ? def.capabilities
    : []) {
    const id = `${pkg}.${capability.name}`;
    text(capability.name, `name of a capability in package ${pkg}`);
    if (typeof capability.name === "string") {
      if (!NAME.test(capability.name))
        problems.push(`capability name "${id}" must match ${NAME}`);
      if (capabilities.has(capability.name))
        problems.push(`capability name "${id}" is used twice`);
      capabilities.add(capability.name);
    }
    text(capability.title, `title of capability ${id}`);
    text(capability.description, `description of capability ${id}`);
  }

  if (problems.length)
    throw new Error(`package ${pkg} is invalid:\n- ${problems.join("\n- ")}`);
}
