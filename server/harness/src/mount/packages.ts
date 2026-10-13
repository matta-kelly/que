/**
 * Mount: read packages at startup. Each folder it is given is a capability
 * package; mount reads its definition and skills and touches no credentials.
 * A definition or a skill that breaks the contract (validatePackage and
 * parseSkill in @que/core) fails mounting.
 */

import "./supply.js";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  parseSkill,
  validatePackage,
  type PackageDefinition,
  type Skill,
} from "@que/core";

export type MountedPackage = { definition: PackageDefinition; skills: Skill[] };

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
        const text = await readFile(
          join(dir, "skills", e.name, "SKILL.md"),
          "utf8",
        );
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

export async function mountPackages(dirs: string[]): Promise<MountedPackage[]> {
  const mounted: MountedPackage[] = [];

  for (const dir of dirs) {
    const index = join(dir, "index.ts");
    if (!existsSync(index))
      throw new Error(`mount: ${dir} holds no package (no index.ts)`);
    const definition = (
      (await import(pathToFileURL(index).href)) as {
        default?: PackageDefinition;
      }
    ).default;
    try {
      validatePackage(definition);
    } catch (error) {
      throw new Error(`mount: ${dir}: ${(error as Error).message}`, {
        cause: error,
      });
    }
    mounted.push({
      definition,
      skills: await readSkills(dir, definition.name),
    });
  }
  return mounted;
}
