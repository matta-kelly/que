/**
 * Mount: read plugins at startup. Each folder it is given is a capability
 * plugin; mount reads its definition and skills and touches no credentials.
 * A definition or a skill that breaks the contract (validatePlugin and
 * parseSkill in @que/core) fails mounting.
 */

import "./supply.js";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  parseSkill,
  validatePlugin,
  type PluginDefinition,
  type Skill,
} from "@que/core";

export type MountedPlugin = { definition: PluginDefinition; skills: Skill[] };

// Only the skills the definition lists: a folder it does not list is not read.
async function readSkills(
  dir: string,
  { name: plugin, skills }: PluginDefinition,
): Promise<Skill[]> {
  return Promise.all(
    skills.map(async (name) => {
      const id = `${plugin}/${name}`;
      const file = join(dir, "skills", name, "SKILL.md");
      let text;
      try {
        text = await readFile(file, "utf8");
      } catch (error) {
        throw new Error(`mount: skill ${id} has no file (${file})`, {
          cause: error,
        });
      }
      try {
        return parseSkill(id, text);
      } catch (error) {
        throw new Error(`mount: ${(error as Error).message}`, {
          cause: error,
        });
      }
    }),
  );
}

export async function mountPlugins(dirs: string[]): Promise<MountedPlugin[]> {
  const mounted: MountedPlugin[] = [];

  for (const dir of dirs) {
    const index = join(dir, "index.ts");
    if (!existsSync(index))
      throw new Error(`mount: ${dir} holds no package (no index.ts)`);
    const definition = (
      (await import(pathToFileURL(index).href)) as {
        default?: PluginDefinition;
      }
    ).default;
    try {
      validatePlugin(definition);
    } catch (error) {
      throw new Error(`mount: ${dir}: ${(error as Error).message}`, {
        cause: error,
      });
    }
    mounted.push({
      definition,
      skills: await readSkills(dir, definition),
    });
  }
  return mounted;
}
