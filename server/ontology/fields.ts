/**
 * The schemas of que's fields, and the messages they give: what a node of que's ontology holds, and what que's code
 * parses with. One place for each field, so a note, a card and a definition are checked by one schema.
 */

import * as z from "zod";

// What model APIs allow in a tool name. The harness names each tool
// `<plugin>-<op>`, so the combined name must fit too.
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

// A name as the open standards take it (Agent Plugins for a plugin, Agent Skills for a skill), which also fits a
// tool name: lowercase letters and digits, with single hyphens between them.
const STANDARD_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A plugin's or a skill's name: a name the open standards take, at most 64 characters. */
export const standardName = text
  .regex(STANDARD_NAME, {
    error: ({ input }) =>
      `must be lowercase letters and digits, with single hyphens between them, got ${JSON.stringify(input)}`,
  })
  .max(64, { error: "must be at most 64 characters" });

/** A name: text that model APIs allow in a tool name. A name that does not match says what it got, as the lead leaves it out. */
export const name = text.regex(NAME, {
  error: ({ input }) => `must match ${NAME}, got ${JSON.stringify(input)}`,
});

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
