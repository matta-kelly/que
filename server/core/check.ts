/**
 * What the specs build their schemas from, and the one way they check a value
 * against one. A schema says what is wrong ("is missing"); `check` says where.
 */

import * as z from "zod";

// What model APIs allow in a tool name. The harness names each tool
// `<package>_<op>`, so the combined name must fit too.
export const NAME = /^[a-zA-Z0-9_-]{1,64}$/;

/** Text that is not blank. The value is kept as written. */
export const text = z
  .string({
    error: (issue) =>
      issue.input === undefined ? "is missing" : "must be text",
  })
  .regex(/\S/, "is missing");

/** A name: text that model APIs allow in a tool name. */
export const name = text.regex(NAME, `must match ${NAME}`);

/** A value that is a function. Only that is checked: what it takes and gives is the type's to say. */
export const fn = <F>() =>
  z
    .custom<F>()
    .refine((value) => typeof value === "function", "must be a function");

/** A refinement of a list: no two items have the same name. */
export const once =
  <T>(nameOf: (item: T) => string) =>
  (items: T[], ctx: z.RefinementCtx) => {
    const seen = new Set<string>();
    items.forEach((item, i) => {
      const name = nameOf(item);
      if (seen.has(name))
        ctx.addIssue({ code: "custom", path: [i], message: "is used twice" });
      seen.add(name);
    });
  };

// The path to an issue, with each item of a list named by its name: `ops.search.title`.
function where(value: unknown, path: PropertyKey[]): string {
  let here = value;
  return path
    .map((key) => {
      here = (here as Record<PropertyKey, unknown> | undefined)?.[key];
      const name =
        typeof here === "string" ? here : (here as { name?: unknown })?.name;
      return typeof key === "number" && typeof name === "string" && name
        ? name
        : String(key);
    })
    .join(".");
}

/**
 * Check a value against a schema, throwing one error that lists every
 * problem, each one after the field it is in. `what` leads the error.
 */
export function check<S extends z.ZodType>(
  schema: S,
  value: unknown,
  what: string,
): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) =>
    [where(value, issue.path), issue.message].filter(Boolean).join(" "),
  );
  throw new Error(`${what}:\n- ${problems.join("\n- ")}`);
}
