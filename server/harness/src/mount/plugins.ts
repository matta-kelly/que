/**
 * Mount: read plugins at startup. Each folder it is given is a plugin;
 * mount reads its definition, its card and its skills, and touches no
 * credentials. A definition or a skill that breaks the contract
 * (validatePlugin and parseSkill in @que/plugin) fails mounting, and so does
 * one whose npm package's `@que/plugin` peer range que's own @que/plugin is
 * outside, or that names `@que/core` as its peer, and a plugin whose card (plugin.json) is not what its definition
 * makes. Then the plugins are checked as one graph (checkPlugins): a name two
 * plugins give, and a name a plugin uses that the deployment does not give,
 * fail mounting.
 */

import "./supply.js";
import { existsSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { satisfies } from "semver";
import {
  checkCard,
  checkPlugins,
  locatePlugin,
  parseSkill,
  piecesOf,
  readDefinition,
  sayProblem,
  skillFolders,
  type Card,
  type Case,
  type PluginDefinition,
  type PluginFiles,
  type Skill,
} from "@que/plugin";

export type MountedPlugin = { definition: PluginDefinition; skills: Skill[] };

type Manifest = { peerDependencies?: Record<string, string> };

const readManifest = (file: string): Manifest =>
  JSON.parse(readFileSync(file, "utf8")) as Manifest;

// The @que/plugin every plugin is handed (supply.ts), and so the version its range is checked against.
const PLUGIN = (
  readManifest(join(import.meta.dirname, "../../../plugin/package.json")) as {
    version: string;
  }
).version;

// A plugin's npm package names the @que/plugin it works with as a peer. One with no package.json, or no range, works
// with any. A prerelease of que's @que/plugin counts as its version: semver leaves it out of every range otherwise,
// `*` included. One that names @que/core is refused: the plugin contract is not there.
function checkRange(dir: string, file: string): void {
  if (!existsSync(file)) return;
  let manifest: Manifest | null;
  try {
    manifest = readManifest(file);
  } catch (error) {
    throw new Error(`mount: ${file}: ${(error as Error).message}`, {
      cause: error,
    });
  }
  if (manifest?.peerDependencies?.["@que/core"] !== undefined)
    throw new Error(
      `mount: ${dir}: the plugin contract moved to @que/plugin: name it as the peer in ${file} ("@que/plugin": "^${PLUGIN}"), in place of @que/core`,
    );
  const range = manifest?.peerDependencies?.["@que/plugin"];
  if (
    range !== undefined &&
    !satisfies(PLUGIN, range, { includePrerelease: true })
  )
    throw new Error(
      `mount: ${dir}: needs @que/plugin ${range}, and que's is ${PLUGIN}`,
    );
}

// Each folder under skills/ is a skill (skillFolders). A folder with no SKILL.md fails: que is stricter than the
// standard, which skips it, as such a folder is a skill whose file is missing or misnamed.
async function readSkills(
  dir: string,
  files: PluginFiles,
  { name: plugin }: PluginDefinition,
): Promise<Skill[]> {
  const folders = skillFolders(dir);
  const fileless = folders.filter(
    (folder) =>
      !statSync(files.skill(folder), { throwIfNoEntry: false })?.isFile(),
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
          await readFile(files.skill(folder), "utf8"),
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
 * The plugin in `dir`, as mount reads it: its files, its npm package's @que/plugin range held to que's, and its
 * definition and its cases, checked against the contract (readDefinition in @que/plugin). The card's writer reads a
 * plugin this way too.
 */
export async function loadPlugin(dir: string): Promise<{
  files: PluginFiles;
  definition: PluginDefinition;
  cases: Case[];
}> {
  let files;
  try {
    files = locatePlugin(dir);
  } catch (error) {
    throw new Error(`mount: ${(error as Error).message}`, { cause: error });
  }
  checkRange(dir, files.package);
  try {
    return await readDefinition(dir);
  } catch (error) {
    throw new Error(`mount: ${(error as Error).message}`, { cause: error });
  }
}

type Read = MountedPlugin & { dir: string; card: Card };

// The plugin in `dir`: its definition (loadPlugin), its card, held to it, and its skills.
async function readPlugin(dir: string): Promise<Read> {
  const { files, definition, cases } = await loadPlugin(dir);
  let card;
  try {
    card = checkCard(dir, { definition, cases });
  } catch (error) {
    throw new Error(`mount: ${(error as Error).message}`, { cause: error });
  }
  return {
    dir,
    card,
    definition,
    skills: await readSkills(dir, files, definition),
  };
}

// Throw when the plugins, as one graph, break the plugin schema. A name in `unread` is there, and given elsewhere.
function judge(read: Read[], unread: string[] = []): MountedPlugin[] {
  const problems = checkPlugins(
    read.flatMap(({ card, skills, dir }) => piecesOf(card, skills, dir)),
    unread,
  );
  if (problems.length)
    throw new Error(
      `mount: the plugins break the plugin schema:\n- ${problems.map(sayProblem).join("\n- ")}`,
    );
  return read.map(({ definition, skills }) => ({ definition, skills }));
}

/**
 * The plugin in `dir`, mounted on its own, with its skills and cases. What it uses is not resolved here, as only the
 * whole deployment gives it (mountPlugins): it is there, and not read.
 */
export async function mountPlugin(dir: string): Promise<MountedPlugin> {
  const read = await readPlugin(dir);
  const { uses } = read.definition;
  const [mounted] = judge([read], [...uses.ops, ...uses.skills]);
  return mounted;
}

/** The plugins a deployment lists, mounted as one graph: each name a plugin uses is one of theirs. */
export async function mountPlugins(dirs: string[]): Promise<MountedPlugin[]> {
  const read: Read[] = [];
  for (const dir of dirs) read.push(await readPlugin(dir));
  return judge(read);
}
