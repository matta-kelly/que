/**
 * Mount: read plugins at startup. Each folder it is given is a plugin;
 * mount reads its definition and skills and touches no credentials.
 * A definition or a skill that breaks the contract (validatePlugin and
 * parseSkill in @que/core) fails mounting, and so does one whose npm
 * package's `@que/core` peer range que's own @que/core is outside, and so
 * does a name a domain uses that no mounted connector gives (uses.ts).
 */

import "./supply.js";
import { unresolvedUses } from "./uses.js";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { satisfies } from "semver";
import {
  locatePlugin,
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

// Each folder under skills/ is a skill, as Agent Plugins finds them: one level down, in name order. A folder with no
// SKILL.md fails: que is stricter than the standard, which skips it, as such a folder is a skill whose file is
// missing or misnamed. A plugin with no skills/ has none.
async function readSkills(
  root: string,
  { name: plugin }: PluginDefinition,
): Promise<Skill[]> {
  if (!existsSync(root)) return [];
  const folders = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const fileless = folders.filter(
    (folder) =>
      !statSync(join(root, folder, "SKILL.md"), {
        throwIfNoEntry: false,
      })?.isFile(),
  );
  if (fileless.length)
    throw new Error(
      `mount: ${plugin} has a folder under skills/ with no SKILL.md: ${fileless.join(", ")}. Each folder there is a skill: give it its SKILL.md, or move it into the skill it belongs to`,
    );
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

/**
 * The plugin in `dir`: where its files are, and its definition, checked against the contract. Mount reads each
 * plugin this way, and so does anything else that reads one (the card's writer).
 */
export async function loadPlugin(dir: string): Promise<{
  files: ReturnType<typeof locatePlugin>;
  definition: PluginDefinition;
}> {
  let files;
  try {
    files = locatePlugin(dir);
  } catch (error) {
    throw new Error(`mount: ${(error as Error).message}`, { cause: error });
  }
  checkCore(dir);
  const definition = (
    (await import(pathToFileURL(files.definition).href)) as {
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
  return { files, definition };
}

export async function mountPlugins(dirs: string[]): Promise<MountedPlugin[]> {
  const mounted: MountedPlugin[] = [];

  for (const dir of dirs) {
    const { files, definition } = await loadPlugin(dir);
    mounted.push({
      definition,
      skills: await readSkills(files.skills, definition),
    });
  }
  // What a domain uses resolves only once the whole deployment is mounted.
  const unresolved = unresolvedUses(mounted);
  if (unresolved.length)
    throw new Error(
      `mount: a plugin uses what the deployment does not give:\n- ${unresolved.join("\n- ")}`,
    );
  return mounted;
}
