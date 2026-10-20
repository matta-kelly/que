/**
 * Mount: read a deployment from disk. A deployment is a folder whose index.ts
 * has its definition as the default export. A definition that breaks the
 * contract (validateDeployment in @que/core) fails mounting, and so does an
 * agent config or a loop config that breaks its own, and an agent config that
 * names a plugin the deployment does not mount, or a loop or a model it does
 * not list. So does a model config that breaks its own or has no window or no
 * price from its file or a source, and a `MODEL` setting, which que no longer
 * reads.
 */

import "./supply.js";
import { existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  pluginsOf,
  validateDeployment,
  type AgentDefinition,
  type LoopDefinition,
  type MountedModel,
} from "@que/core";
import { mountAgents } from "./agents.js";
import { mountLoops } from "./loops.js";
import { factSources, type FactSources } from "./model-facts/index.js";
import { mountModels } from "./models.js";
import { deploymentFolder } from "./deployment-folder.js";
import { mountPlugins, type MountedPlugin } from "./plugins.js";

// A listed plugin is a folder path, or the name of its npm package, found as Node finds an import
// from the deployment's folder: in the first `node_modules` up from it that has it.
function pluginFolder(dir: string, listed: string): string {
  if (isAbsolute(listed) || listed.startsWith(".")) return resolve(dir, listed);
  const lookup = createRequire(join(dir, "index.ts")).resolve.paths(listed);
  const found = lookup
    ?.map((modules) => join(modules, listed))
    .find((folder) => existsSync(join(folder, "package.json")));
  if (!found)
    throw new Error(
      `mount: deployment ${dir}: the package "${listed}" is not installed: no node_modules from this folder up holds it`,
    );
  return realpathSync(found);
}

export async function loadDeployment(dir: string): Promise<{
  name: string;
  plugins: string[];
  agents: string[];
  loops: string[];
  models: string[];
}> {
  const index = join(dir, "index.ts");
  if (!existsSync(index))
    throw new Error(`mount: deployment ${dir} has no index.ts`);
  const definition = (
    (await import(pathToFileURL(index).href)) as { default?: unknown }
  ).default;
  try {
    validateDeployment(definition);
  } catch (error) {
    throw new Error(`mount: deployment ${dir}: ${(error as Error).message}`, {
      cause: error,
    });
  }
  return {
    name: definition.name,
    plugins: pluginsOf(definition).map((listed) => pluginFolder(dir, listed)),
    agents: definition.agents.map((file) => resolve(dir, file)),
    loops: definition.loops.map((file) => resolve(dir, file)),
    models: definition.models.map((file) => resolve(dir, file)),
  };
}

export async function mountDeployment(
  dir: string,
  env: {
    MODEL?: string;
    FIREWORKS_API_KEY?: string;
    BEAM_API_KEY?: string;
  } = {},
  // Where a model's window and price come from when its file writes none. A test hands in its own.
  sources: FactSources = factSources(dir, env),
): Promise<{
  plugins: MountedPlugin[];
  agents: AgentDefinition[];
  loops: LoopDefinition[];
  models: MountedModel[];
}> {
  if (env.MODEL !== undefined)
    throw new Error(
      "mount: MODEL is set, and que no longer reads it: a model is a file of its own, listed in `models` in the deployment",
    );
  const {
    plugins: folders,
    agents: files,
    loops: loopFiles,
    models: modelFiles,
  } = await loadDeployment(dir);
  const plugins = await mountPlugins(folders);
  const agents = await mountAgents(files);
  const loops = await mountLoops(loopFiles);
  const models = await mountModels(modelFiles, sources);
  const mounted = plugins.map((p) => p.definition.name);
  for (const agent of agents) {
    const unmounted = pluginsOf(agent).filter(
      (name) => !mounted.includes(name),
    );
    if (unmounted.length)
      throw new Error(
        `mount: deployment ${dir}: the agent "${agent.name}" names packages the deployment does not mount: ${unmounted.join(", ")}`,
      );
  }
  // An agent names a loop and a model by name, and each has to be one the deployment lists.
  for (const [kind, configs] of [
    ["loop", loops],
    ["model", models],
  ] as const) {
    const listed = configs.map((config) => config.name);
    for (const agent of agents) {
      const named = agent[kind];
      if (!listed.includes(named))
        throw new Error(
          `mount: deployment ${dir}: the agent "${agent.name}" names the ${kind} "${named}", which the deployment does not list. ${kind === "loop" ? "Loops" : "Models"}: ${listed.join(", ")}`,
        );
    }
  }
  return { plugins, agents, loops, models };
}

export async function mountFromEnv(env: {
  QUE_DEPLOYMENT?: string;
  MODEL?: string;
  FIREWORKS_API_KEY?: string;
  BEAM_API_KEY?: string;
}): Promise<MountedPlugin[]> {
  return (await mountDeployment(deploymentFolder(env), env)).plugins;
}
