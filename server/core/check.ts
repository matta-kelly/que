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

/** Guards for `that`: text that is not blank, a name, and a whole number above zero. */
export const isText = (value: unknown): value is string =>
  typeof value === "string" && !!value.trim();
export const isName = (value: unknown): value is string =>
  typeof value === "string" && NAME.test(value);
export const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

/** A name: text that model APIs allow in a tool name. A name that does not match says what it got, as the lead leaves it out. */
export const name = text.regex(NAME, {
  error: ({ input }) => `must match ${NAME}, got ${JSON.stringify(input)}`,
});

/** A value that is a function. Only that is checked: what it takes and gives is the type's to say. */
export const fn = z
  .custom()
  .refine((value) => typeof value === "function", "must be a function");

/** An error that says what a value must be, and what it got. With `missing`, a value left out says that instead. */
export const must =
  (what: string, missing?: string) =>
  ({ input }: { input?: unknown }) =>
    input === undefined && missing
      ? missing
      : `must be ${what}, got ${JSON.stringify(input)}`;

/**
 * A value that `is` holds for, or `must(what, missing)`. Its issue does not
 * stop the checks of the object it is in, as a wrong type would.
 */
export const that = <T>(
  is: (value: unknown) => value is T,
  what: string,
  missing?: string,
) => z.custom<T>().refine(is, { error: must(what, missing) });

/**
 * The error of an object that holds only its own fields: one it does not know
 * has no field there, and one in `moved` gets that message.
 */
export const strict = (
  moved: Record<string, string> = {},
  notObject = "must be an object",
) => ({
  error: (issue: z.core.$ZodRawIssue) =>
    issue.code === "unrecognized_keys"
      ? issue.keys
          .map((key) => moved[key] ?? `has no field "${key}"`)
          .join("; ")
      : issue.code === "invalid_type"
        ? notObject
        : undefined,
});

/** The name of a config for the lead of its error, when it is one: ` chat`, or nothing. */
export const named = (definition: unknown) => {
  const name = (definition as { name?: unknown } | undefined)?.name;
  return typeof name === "string" && NAME.test(name) ? ` ${name}` : "";
};

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
      return typeof key === "number" && typeof name === "string" && name.trim()
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
