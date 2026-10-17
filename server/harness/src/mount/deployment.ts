/**
 * Mount: read a deployment from disk. A deployment is a folder whose index.ts
 * has its definition as the default export. A definition that breaks the
 * contract (validateDeployment in @que/core) fails mounting, and so does an
 * agent config or a loop config that breaks its own, and an agent config that
 * names a package the deployment does not mount, or a loop or a model it does
 * not list. So does a model config that breaks its own or has no window or no
 * price from its file or a source, and a `MODEL` setting, which que no longer
 * reads.
 */

import "./supply.js";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
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
import { mountPackages, type MountedPackage } from "./packages.js";

export async function loadDeployment(dir: string): Promise<{
  name: string;
  packages: string[];
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
    packages: definition.packages.map((folder) => resolve(dir, folder)),
    agents: definition.agents.map((file) => resolve(dir, file)),
    loops: (definition.loops ?? []).map((file) => resolve(dir, file)),
    models: definition.models.map((file) => resolve(dir, file)),
  };
}

export async function mountDeployment(
  dir: string,
  env: { MODEL?: string; FIREWORKS_API_KEY?: string } = {},
  // Where a model's window and price come from when its file writes none. A test hands in its own.
  sources: FactSources = factSources(dir, env),
): Promise<{
  packages: MountedPackage[];
  agents: AgentDefinition[];
  loops: LoopDefinition[];
  models: MountedModel[];
}> {
  if (env.MODEL !== undefined)
    throw new Error(
      "mount: MODEL is set, and que no longer reads it: a model is a file of its own, listed in `models` in the deployment",
    );
  const {
    packages: folders,
    agents: files,
    loops: loopFiles,
    models: modelFiles,
  } = await loadDeployment(dir);
  const packages = await mountPackages(folders);
  const agents = await mountAgents(files);
  const loops = await mountLoops(loopFiles);
  const models = await mountModels(modelFiles, sources);
  const mounted = packages.map((p) => p.definition.name);
  for (const agent of agents) {
    const unmounted = agent.packages.filter((name) => !mounted.includes(name));
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
      if (named !== undefined && !listed.includes(named))
        throw new Error(
          `mount: deployment ${dir}: the agent "${agent.name}" names the ${kind} "${named}", which the deployment does not list. ${
            listed.length
              ? `${kind === "loop" ? "Loops" : "Models"}: ${listed.join(", ")}`
              : `This deployment lists no ${kind}s`
          }`,
        );
    }
  }
  return { packages, agents, loops, models };
}

export async function mountFromEnv(env: {
  QUE_DEPLOYMENT?: string;
  MODEL?: string;
  FIREWORKS_API_KEY?: string;
}): Promise<MountedPackage[]> {
  return (await mountDeployment(deploymentFolder(env), env)).packages;
}
