/**
 * Mount: read plugins at startup. Each folder it is given is a plugin; mount reads its code (its definition and its
 * cases) and its skills (readPlugin in @mku1tra/que-plugin), and touches no credentials. A file that cannot be read
 * fails mounting, and so does a plugin whose npm package's `@mku1tra/que-plugin` peer range que's own
 * @mku1tra/que-plugin is outside, or that names `@que/core` as its peer. A plugin mounted on its own is then linted
 * from its root, the root whose ground holds its folder (basis's rootOf). A deployment's plugins are
 * mounted with it, in its root's graph (deployment.ts). A card (plugin.json) in the folder is not read.
 */

import "./supply.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { satisfies } from "semver";
import { lintRoot, rootOf } from "@mku1tra/basis";
import {
  locatePlugin,
  plugin,
  readPlugin,
  sayProblem,
  type Definition,
  type PluginFiles,
  type ReadPlugin,
  type Skill,
} from "@mku1tra/que-plugin";

export type MountedPlugin = { definition: Definition; skills: Skill[] };

type Manifest = { peerDependencies?: Record<string, string> };

const readManifest = (file: string): Manifest =>
  JSON.parse(readFileSync(file, "utf8")) as Manifest;

// The @mku1tra/que-plugin every plugin is handed (supply.ts), and so the version its range is checked against.
const PLUGIN = (
  readManifest(join(import.meta.dirname, "../../../plugin/package.json")) as {
    version: string;
  }
).version;

// A plugin's npm package names the @mku1tra/que-plugin it works with as a peer. One with no package.json, or no range, works
// with any. A prerelease of que's @mku1tra/que-plugin counts as its version: semver leaves it out of every range otherwise,
// `*` included. One that names @que/core is refused: the plugin contract is not there.
export function checkRange(dir: string, file: string): void {
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
      `mount: ${dir}: the plugin contract moved to @mku1tra/que-plugin: name it as the peer in ${file} ("@mku1tra/que-plugin": "^${PLUGIN}"), in place of @que/core`,
    );
  const range = manifest?.peerDependencies?.["@mku1tra/que-plugin"];
  if (
    range !== undefined &&
    !satisfies(PLUGIN, range, { includePrerelease: true })
  )
    throw new Error(
      `mount: ${dir}: needs @mku1tra/que-plugin ${range}, and que's is ${PLUGIN}`,
    );
}

type Read = ReadPlugin & { definition: Definition };

/**
 * The plugin in `dir`, as mount reads it: its files, its npm package's @mku1tra/que-plugin range held to que's, and
 * its definition, its cases and its skills (readPlugin in @mku1tra/que-plugin). Throws naming the folder and each file
 * that cannot be read. The card's writer reads a plugin this way too.
 */
export async function loadPlugin(dir: string): Promise<Read> {
  let files: PluginFiles;
  try {
    files = locatePlugin(dir);
  } catch (error) {
    throw new Error(`mount: ${(error as Error).message}`, { cause: error });
  }
  checkRange(dir, files.package);
  const read = await readPlugin(dir);
  if (read.problems.length || !read.definition)
    throw new Error(
      `mount: ${dir} cannot be read:\n- ${read.problems.map(sayProblem).join("\n- ")}`,
    );
  return read as Read;
}

/**
 * The plugin in `dir`, mounted on its own, with its skills and cases: linted from its root, the root whose ground
 * holds its folder, which gives it (its own, of pluginSchema, or a root above it). What it uses is resolved only where
 * a deployment gives it: in a plugin's own root, it is there and not read. Each case's capability is resolved against
 * the plugin's own: a case is about a capability of its plugin.
 */
export async function mountPlugin(dir: string): Promise<MountedPlugin> {
  const read = await loadPlugin(dir);
  const root = rootOf(dir);
  if (root === undefined)
    throw new Error(
      `mount: ${dir} is in no root: a plugin is checked from the root whose ground holds it, the first folder up from it with a basis.config.ts. Give its folder one whose schema is pluginSchema.`,
    );
  const { problems, graph } = await lintRoot(root);
  if (problems.length)
    throw new Error(
      `mount: the root ${root} breaks the plugin schema:\n- ${problems.map((problem) => sayProblem({ ...problem, path: join(root, problem.path) })).join("\n- ")}`,
    );
  if (!graph.get(read.definition.plugin.name, plugin.types.plugin))
    throw new Error(
      `mount: the root ${root} gives no plugin ${read.definition.plugin.name}: its schema's sources do not read ${dir}`,
    );
  return { definition: read.definition, skills: read.skills };
}
