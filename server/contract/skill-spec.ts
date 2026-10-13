/**
 * What a skill is: the text part of a package. Each one is a `SKILL.md`, and
 * the harness reads the file and hands its text here.
 */

export type Skill = {
  id: string;
  title: string;
  description: string;
  body: string;
};

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
 * Turn the text of a `SKILL.md` into a skill, throwing when it has no title
 * or no description: those are what the model reads to choose a skill.
 */
export function parseSkill(id: string, text: string): Skill {
  const { meta, body } = parseFrontmatter(text);
  if (!meta.title?.trim() || !meta.description?.trim()) {
    throw new Error(
      `skill ${id} needs a title and description in its frontmatter`,
    );
  }
  return { id, title: meta.title, description: meta.description, body };
}
