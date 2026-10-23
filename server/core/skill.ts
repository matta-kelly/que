/**
 * What a skill is: the text part of a plugin. Each one is a `SKILL.md` in the
 * Agent Skills format, and the harness reads the file and hands its text here.
 */

import { parse } from "yaml";
import * as z from "zod";
import { check, standardName, text } from "./check.js";

// The title and the description are what the model reads to choose a skill.
export const Skill = z.object({
  id: z.string(),
  title: text,
  description: text,
  body: z.string(),
});

export type Skill = z.infer<typeof Skill>;

// The Agent Skills frontmatter que reads. Its other fields (license, compatibility, allowed-tools) are allowed and
// not read. que's title is in `metadata`, the standard's place for a client's own fields.
const Frontmatter = z.object(
  {
    name: standardName,
    description: text.max(1024, { error: "must be at most 1024 characters" }),
    metadata: z
      .record(z.string(), z.string(), {
        error: "must be a map of text to text",
      })
      .optional(),
  },
  { error: "is missing (a --- fenced YAML block at the top)" },
);

// The YAML between the --- fences at the top, and the text after them.
function split(id: string, file: string): { meta: unknown; body: string } {
  const match = file.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: undefined, body: file };
  try {
    return { meta: parse(match[1]) ?? {}, body: match[2].trim() };
  } catch (error) {
    throw new Error(
      `skill ${id} is invalid:\n- frontmatter is not YAML (${(error as Error).message})`,
      { cause: error },
    );
  }
}

/**
 * Turn the text of `skills/<folder>/SKILL.md` into a skill, throwing when its
 * frontmatter has no name, a name that is not the folder's, or no description.
 * With no `metadata.title`, its title is its name.
 */
export function parseSkill(
  plugin: string,
  folder: string,
  file: string,
): Skill {
  const id = `${plugin}/${folder}`;
  const { meta, body } = split(id, file);
  const front = check(
    Frontmatter.refine((front) => front.name === folder, {
      path: ["name"],
      error: `must be its folder's name, ${folder}`,
    }),
    meta,
    `skill ${id} is invalid`,
  );
  return check(
    Skill,
    {
      id,
      title: front.metadata?.title ?? front.name,
      description: front.description,
      body,
    },
    `skill ${id} is invalid`,
  );
}
