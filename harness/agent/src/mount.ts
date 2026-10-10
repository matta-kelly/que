/**
 * Mount: discover packages at startup. Every folder in packages/ is a
 * capability package; mount reads its definition and skills and touches no
 * credentials. A definition that breaks the contract (validatePackage in
 * @que/core) or a skill without a title and description fails mounting.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { validatePackage, type PackageDefinition } from "@que/core";

const PACKAGES_DIR = join(import.meta.dirname, "../../packages");

export type Skill = {
  id: string;
  title: string;
  description: string;
  body: string;
};
export type MountedPackage = { definition: PackageDefinition; skills: Skill[] };

// Minimal frontmatter: `key: value` lines between --- fences.
function parseSkill(text: string): {
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

async function readSkills(dir: string, pkg: string): Promise<Skill[]> {
  let entries;
  try {
    entries = await readdir(join(dir, "skills"), { withFileTypes: true });
  } catch {
    return [];
  }
  return Promise.all(
    entries
      .filter((e) => e.isDirectory())
      .map(async (e) => {
        const id = `${pkg}/${e.name}`;
        const { meta, body } = parseSkill(
          await readFile(join(dir, "skills", e.name, "SKILL.md"), "utf8"),
        );
        if (!meta.title?.trim() || !meta.description?.trim()) {
          throw new Error(
            `mount: skill ${id} needs a title and description in its frontmatter`,
          );
        }
        return { id, title: meta.title, description: meta.description, body };
      }),
  );
}

async function mountPackages(): Promise<MountedPackage[]> {
  const dirs = (await readdir(PACKAGES_DIR, { withFileTypes: true })).filter(
    (d) => d.isDirectory(),
  );
  const mounted: MountedPackage[] = [];

  for (const d of dirs) {
    const dir = join(PACKAGES_DIR, d.name);
    const { name } = JSON.parse(
      await readFile(join(dir, "package.json"), "utf8"),
    ) as { name: string };
    const definition = ((await import(name)) as { default?: PackageDefinition })
      .default;
    try {
      validatePackage(definition);
    } catch (error) {
      throw new Error(
        `mount: packages/${d.name} (${name}): ${(error as Error).message}`,
        { cause: error },
      );
    }
    mounted.push({
      definition,
      skills: await readSkills(dir, definition.name),
    });
  }
  return mounted;
}

// Mounted once, when this module first loads; shared by the agent, the API and the evals.
export const packages = await mountPackages();
