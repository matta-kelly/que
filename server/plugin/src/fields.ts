/**
 * The schemas of a plugin's fields, and the messages they give: what a node of the plugin schema holds, and what a
 * definition, a card and a skill are parsed with. One place for each field, so a note, a card and a definition are
 * checked by one schema.
 */

import { Name, type Type } from "@mku1tra/basis";
import * as z from "zod";

/** Text that is not blank. The value is kept as written. */
export const text = z
  .string({
    error: (issue) =>
      issue.input === undefined ? "is missing" : "must be text",
  })
  .regex(/\S/, "is missing");

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

/** A JSON Schema, as a card writes one: what a credential or an op's input takes. */
export const JsonSchema = z.record(z.string(), z.unknown(), {
  error: "must be a JSON Schema object",
});

// The Agent Skills frontmatter que reads. Its other fields (license, compatibility, allowed-tools) are allowed and
// not read. que's title is in `metadata`, the standard's place for a client's own fields.
export const SkillFrontmatter = z.object({
  name: standardName,
  description: text.max(1024, { error: "must be at most 1024 characters" }),
  metadata: z
    .record(z.string(), z.string(), {
      error: "must be a map of text to text",
    })
    .optional(),
});

/** The fields a type gives a node beside its name, type and description: what a definition holds of the thing. */
export function fieldsOf<T extends Type>(
  type: T,
): Omit<T["schema"]["shape"], "name" | "type" | "description"> {
  return Object.fromEntries(
    Object.entries(type.schema.shape).filter(
      ([field]) => !["name", "type", "description"].includes(field),
    ),
  ) as Omit<T["schema"]["shape"], "name" | "type" | "description">;
}
