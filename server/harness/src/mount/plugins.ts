/**
 * Mount: read plugins at startup. Each folder it is given is a plugin;
 * mount reads its definition and skills and touches no credentials.
 * A definition or a skill that breaks the contract (validatePlugin and
 * parseSkill in @que/core) fails mounting, and so does one whose npm
 * package's `@que/core` peer range que's own @que/core is outside.
 */

import "./supply.js";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { satisfies } from "semver";
import {
  parseSkill,
  validatePlugin,
  type PluginDefinition,
  type Skill,
} from "@que/core";

export type MountedPlugin = { definition: PluginDefinition; skills: Skill[] };

type Manifest = { peerDependencies?: Record<string, string> };

const readManifest = (file: string): Manifest =>
  JSON.parse(readFileSync(file, "utf8")) as Manifest;

// The @que/core every plugin is handed (supply.ts), and so the version its range is checked against.
const CORE = (
  readManifest(join(import.meta.dirname, "../../../core/package.json")) as {
    version: string;
  }
).version;

// A plugin's npm package names the @que/core it works with as a peer. One with no package.json, or no range, works with any.
// A prerelease of que's core counts as its version: semver leaves it out of every range otherwise, `*` included.
function checkCore(dir: string): void {
  const file = join(dir, "package.json");
  if (!existsSync(file)) return;
  let manifest: Manifest | null;
  try {
    manifest = readManifest(file);
  } catch (error) {
    throw new Error(`mount: ${file}: ${(error as Error).message}`, {
      cause: error,
    });
  }
  const range = manifest?.peerDependencies?.["@que/core"];
  if (
    range !== undefined &&
    !satisfies(CORE, range, { includePrerelease: true })
  )
    throw new Error(
      `mount: ${dir}: needs @que/core ${range}, and que's is ${CORE}`,
    );
}

// Each folder under skills/ with a SKILL.md is a skill, as Agent Plugins finds them: one level down, in name order.
// A plugin with no skills/ has none.
async function readSkills(
  dir: string,
  { name: plugin }: PluginDefinition,
): Promise<Skill[]> {
  const root = join(dir, "skills");
  if (!existsSync(root)) return [];
  const folders = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((folder) =>
      statSync(join(root, folder, "SKILL.md"), {
        throwIfNoEntry: false,
      })?.isFile(),
    )
    .sort();
  return Promise.all(
    folders.map(async (folder) => {
      try {
        return parseSkill(
          plugin,
          folder,
          await readFile(join(root, folder, "SKILL.md"), "utf8"),
        );
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
      throw new Error(`mount: ${dir} holds no plugin (no index.ts)`);
    checkCore(dir);
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
