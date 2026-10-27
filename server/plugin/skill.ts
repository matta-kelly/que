/**
 * What a skill is: the text part of a plugin. Each one is a `SKILL.md` in the Agent Skills format, read as basis reads
 * a note (readNote), and checked with the skill frontmatter schema. Mount and the source read a skill here.
 */

import { readNote } from "@mku1tra/basis";
import * as z from "zod";
import { check } from "./check.ts";
import { fieldsOf, SkillFrontmatter, text } from "./fields.ts";
import { nameIn } from "./names.ts";
import { plugin } from "./schema.ts";

// The title and the description are what the model reads to choose a skill. Its id is its node's name,
// `<plugin>-<folder>` (nameIn).
export const Skill = z.object({
  id: z.string(),
  ...fieldsOf(plugin.types.skill),
  description: text,
  body: z.string(),
});

export type Skill = z.infer<typeof Skill>;

/**
 * Turn the text of `skills/<folder>/SKILL.md` into a skill, throwing when it has no frontmatter, or frontmatter with
 * no name, a name that is not the folder's, or no description. With no `metadata.title`, its title is its name.
 */
export function parseSkill(
  pluginName: string,
  folder: string,
  file: string,
): Skill {
  const id = nameIn(pluginName, folder);
  const what = `skill ${id} is invalid`;
  // Line ends may be \r\n: the body is kept with \n.
  const lines = file.replace(/\r\n/g, "\n");
  const read = readNote(`${folder}/SKILL.md`, lines);
  if (!read.ok) throw new Error(`${what}:\n- ${read.problem.message}`);
  // A note with no frontmatter is all body.
  if (read.note.body === lines)
    throw new Error(
      `${what}:\n- frontmatter is missing (a --- fenced YAML block at the top)`,
    );
  const front = check(
    SkillFrontmatter.refine((front) => front.name === folder, {
      path: ["name"],
      error: `must be its folder's name, ${folder}`,
    }),
    read.note.fields,
    what,
  );
  return check(
    Skill,
    {
      id,
      title: front.metadata?.title ?? front.name,
      description: front.description,
      body: read.note.body.trim(),
    },
    what,
  );
}
