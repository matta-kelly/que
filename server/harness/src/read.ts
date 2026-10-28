/**
 * Read a deployment from its folder: its definition (index.ts), each agent, loop and model in a file of its own,
 * found by folder (agents/, loops/, models/), as Agent Plugins finds a plugin's skills, and each plugin it names,
 * found as Node finds an import of that name from the deployment's folder (readPlugin). Mount, the evals, the source
 * and the command read a deployment this way. Each path is a real path, through each link, as basis compares folders:
 * the place the code is, wherever npm put a link to it. What cannot be read is a problem, said at its file, and the
 * rest is still read.
 */

import { existsSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  readPlugin,
  type ReadPlugin,
  type Unreadable,
} from "@mku1tra/que-plugin";
import type { Agent } from "./agent.ts";
import { readNode, type Kind, type NodeOf } from "./define.ts";
import type { Deployment } from "./deployment.ts";
import type { Loop } from "./loop.ts";
import type { Model } from "./model.ts";

/** A node, and the file that gives it. */
export type Placed<N> = { file: string; node: N };

/** A deployment, as read from its folder: what could be read, and a problem for each file that could not. */
export type ReadDeployment = {
  /** Its folder, as its real path. */
  dir: string;
  /** Its definition's file. */
  index: string;
  /** Its definition, when its index.ts gives one. */
  deployment?: Deployment;
  agents: Placed<Agent>[];
  loops: Placed<Loop>[];
  models: Placed<Model>[];
  /** Each plugin it names that is installed, in the order it names them, with the name it gives it. */
  plugins: (ReadPlugin & { name: string })[];
  problems: Unreadable[];
  /** The names of what could not be read: a link to one is not a problem. */
  unread: { path: string; name: string }[];
};

/** The folder of each kind of config, in a deployment's folder. */
export const FOLDERS = {
  agent: "agents",
  loop: "loops",
  model: "models",
} as const;

const defaultOf = async (file: string): Promise<unknown> =>
  ((await import(pathToFileURL(file).href)) as { default?: unknown }).default;

// A path as its real path, through each link. A path that is not there is kept.
const realPathOf = (path: string): string => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

const reason = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * The folder of the plugin `name`: its npm package, found as Node finds an import from the deployment's folder, in the
 * first `node_modules` up from it that has it, as its real path: the folder its code is in, not the link npm made to
 * it. None when no folder up from it has it.
 */
function pluginFolder(dir: string, name: string): string | undefined {
  // Node's own lookup (require.resolve.paths) gives none for a name that is one of Node's modules, such as `domain`.
  for (let at = dir; ; at = dirname(at)) {
    const folder = join(at, "node_modules", name);
    if (existsSync(join(folder, "package.json"))) return realpathSync(folder);
    if (dirname(at) === at) return undefined;
  }
}

// The TypeScript files of a folder, in name order: each holds one config. Tests are not configs.
const configFiles = (folder: string): string[] =>
  existsSync(folder)
    ? readdirSync(folder, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isFile() &&
            entry.name.endsWith(".ts") &&
            !entry.name.endsWith(".test.ts"),
        )
        .map((entry) => join(folder, entry.name))
        .sort()
    : [];

/** The deployment in the folder `given`: its definition, its configs and its plugins, each read as far as it can be. */
export async function readDeployment(given: string): Promise<ReadDeployment> {
  const dir = realPathOf(given);
  const index = join(dir, "index.ts");
  const read: ReadDeployment = {
    dir,
    index,
    agents: [],
    loops: [],
    models: [],
    plugins: [],
    problems: [],
    unread: [],
  };
  const unreadable = (path: string, message: string) =>
    read.problems.push({ path, message, fatal: true });

  const nodeIn = async <K extends Kind>(
    kind: K,
    file: string,
  ): Promise<NodeOf<K> | undefined> => {
    try {
      const given = readNode(kind, await defaultOf(file));
      if ("node" in given) return given.node;
      unreadable(
        file,
        `The ${kind} cannot be read: its default export is no node of the type ${kind}:\n- ${given.faults.join("\n- ")}`,
      );
    } catch (error) {
      unreadable(file, `The ${kind} cannot be read: ${reason(error)}`);
    }
    return undefined;
  };

  if (existsSync(index)) read.deployment = await nodeIn("deployment", index);
  else unreadable(dir, "The deployment cannot be read: it has no index.ts.");

  for (const [kind, folder] of Object.entries(FOLDERS) as [
    keyof typeof FOLDERS,
    string,
  ][])
    for (const file of configFiles(join(dir, folder))) {
      const node = await nodeIn(kind, file);
      if (node)
        (read[folder as "agents"] as Placed<unknown>[]).push({ file, node });
    }

  for (const name of read.deployment?.plugins ?? []) {
    const folder = pluginFolder(dir, name);
    if (folder === undefined) {
      unreadable(
        index,
        `The plugin ${name} is not installed: no node_modules from this folder up holds an npm package of that name.`,
      );
      read.unread.push({ path: index, name });
      continue;
    }
    const plugin = await readPlugin(folder);
    // A plugin whose definition cannot be read is there, by the name the deployment gives it.
    if (!plugin.definition) read.unread.push({ path: index, name });
    read.plugins.push({ ...plugin, name });
  }
  return read;
}
