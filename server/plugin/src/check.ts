/**
 * What the specs build their schemas from, and the one way they check a value
 * against one. A schema says what is wrong ("is missing"); `check` says where.
 */

import * as z from "zod";
import { standardName } from "./fields.ts";

/** A value that is a function. Only that is checked: what it takes and gives is the type's to say. */
export const fn = z
  .custom()
  .refine((value) => typeof value === "function", "must be a function");

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
  return standardName.safeParse(name).success ? ` ${name}` : "";
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

/** What is wrong with a value, by a schema: each problem after the field it is in. None when it parses. */
export const faults = (schema: z.ZodType, value: unknown): string[] =>
  schema
    .safeParse(value)
    .error?.issues.map((issue) =>
      [where(value, issue.path), issue.message].filter(Boolean).join(" "),
    ) ?? [];

/** Throw one error that lists the problems, when there are any. `what` leads the error. */
export function refuse(what: string, problems: readonly string[]): void {
  if (problems.length) throw new Error(`${what}:\n- ${problems.join("\n- ")}`);
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
  refuse(what, faults(schema, value));
  return schema.parse(value);
}
