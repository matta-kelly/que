/**
 * What a skill is: the text part of a plugin. Each one is a `SKILL.md` in the Agent Skills format, read as basis reads
 * a note (readNote), and checked with the skill frontmatter schema. Mount and the source read a skill here.
 */

import { readNote } from "@mku1tra/basis";
import type * as z from "zod";
import { check } from "./check.ts";
import { SkillFrontmatter } from "./fields.ts";
import { plugin } from "./schema.ts";

/**
 * A skill node, and its body: the text the model reads. Its title and description are what the model reads to choose
 * it. Its name is its folder's, the Agent Skills name, and its node's.
 */
export type Skill = z.output<typeof plugin.types.skill.schema> & {
  body: string;
};

/**
 * Turn the text of `skills/<folder>/SKILL.md` into a skill, throwing when it has no frontmatter, or frontmatter with
 * no name, a name that is not the folder's, or no description. With no `metadata.title`, its title is its name. The
 * names in its `allowed-tools`, space-separated, are its uses; with none, it has no uses.
 */
export function parseSkill(folder: string, file: string): Skill {
  const what = `skill ${folder} is invalid`;
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
  const uses = front["allowed-tools"]?.split(/\s+/).filter(Boolean) ?? [];
  return {
    ...check(
      plugin.types.skill.schema,
      {
        name: front.name,
        type: "skill",
        title: front.metadata?.title ?? front.name,
        description: front.description,
        ...(uses.length && { uses }),
      },
      what,
    ),
    body: read.note.body.trim(),
  };
}
