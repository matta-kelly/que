/**
 * What a skill is: the text part of a plugin. Each one is a `SKILL.md`, and
 * the harness reads the file and hands its text here.
 */

import * as z from "zod";
import { check, text } from "./check.js";

// The title and the description are what the model reads to choose a skill.
export const Skill = z.object({
  id: z.string(),
  title: text,
  description: text,
  body: z.string(),
});

export type Skill = z.infer<typeof Skill>;

// Minimal frontmatter: `key: value` lines between --- fences.
function parseFrontmatter(text: string): {
  meta: Record<string, string>;
  body: string;
} {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: text };
  const meta = Object.fromEntries(
    match[1].split("\n").flatMap((line) => {
      const i = line.indexOf(":");
      return i > 0 ? [[line.slice(0, i).trim(), line.slice(i + 1).trim()]] : [];
    }),
  );
  return { meta, body: match[2].trim() };
}

/**
 * Turn the text of a `SKILL.md` into a skill, throwing when its frontmatter
 * has no title or no description.
 */
export function parseSkill(id: string, file: string): Skill {
  const { meta, body } = parseFrontmatter(file);
  return check(
    Skill,
    { id, title: meta.title, description: meta.description, body },
    `skill ${id} is invalid`,
  );
}
