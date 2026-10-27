/**
 * The schemas of que's fields, and the messages they give: what a node of que's ontology holds, and what que's code
 * parses with. One place for each field, so a note, a card and a definition are checked by one schema.
 */

import { Name } from "@mku1tra/basis";
import * as z from "zod";

/** Text that is not blank. The value is kept as written. */
export const text = z
  .string({
    error: (issue) =>
      issue.input === undefined ? "is missing" : "must be text",
  })
  .regex(/\S/, "is missing");

/** Guards for `that`: text that is not blank, and a whole number above zero. */
export const isText = (value: unknown): value is string =>
  typeof value === "string" && !!value.trim();
export const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

/**
 * A plugin's or a skill's name: basis's name, the slug the open standards take (Agent Plugins for a plugin, Agent
 * Skills for a skill), at most 64 characters.
 */
export const standardName = text
  .refine((value) => Name.safeParse(value).success, {
    error: ({ input }) =>
      `must be lowercase letters and digits, with single hyphens between them, got ${JSON.stringify(input)}`,
  })
  .max(64, { error: "must be at most 64 characters" });

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

// The Agent Skills frontmatter que reads. Its other fields (license, compatibility, allowed-tools) are allowed and
// not read. que's title is in `metadata`, the standard's place for a client's own fields.
export const SkillFrontmatter = z.object(
  {
    name: standardName,
    description: text.max(1024, { error: "must be at most 1024 characters" }),
    metadata: z
      .record(z.string(), z.string(), {
        error: "must be a map of text to text",
      })
      .optional(),
  },
  {
    error: ({ input }) =>
      input === undefined
        ? "is missing (a --- fenced YAML block at the top)"
        : "must be a map of fields (name, description, ...)",
  },
);
