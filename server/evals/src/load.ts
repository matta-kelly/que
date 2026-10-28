/**
 * What a deployment has to run: its name, the cases of its plugins, its
 * agent configs and its model configs. Read from the deployment's own files,
 * as mount reads them (a plugin by readPlugin), and checked with the contract.
 * The @mku1tra/que-plugin range check is mount's alone: it is about the
 * @mku1tra/que-plugin mount hands a plugin, and the server that runs the cases mounts.
 */

import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  readPlugin,
  sayProblem,
  type Case,
  type ReadPlugin,
} from "@mku1tra/que-plugin";
import {
  validateAgent,
  validateDeployment,
  validateModel,
  type Agent,
  type Model,
} from "@mku1tra/que-harness";

export type LoadedCase = Case & { plugin: string };

const definitionIn = async (file: string): Promise<unknown> =>
  ((await import(pathToFileURL(file).href)) as { default?: unknown }).default;

// A plugin read as mount reads it (readPlugin): one with a file that cannot be read stops the run.
async function pluginIn(dir: string): Promise<ReadPlugin> {
  const read = await readPlugin(dir);
  if (read.problems.length)
    throw new Error(
      `${dir} cannot be read:\n- ${read.problems.map(sayProblem).join("\n- ")}`,
    );
  return read;
}

// Each case, with the plugin that holds its capability: a case's plugin is its capability's, in the graph.
function casesOf(plugins: ReadPlugin[]): LoadedCase[] {
  const holder = new Map<string, string>();
  for (const { definition } of plugins)
    for (const capability of definition?.plugin.capabilities ?? []) {
      const other = holder.get(capability);
      if (other !== undefined)
        throw new Error(
          `the plugins ${other} and ${definition!.plugin.name} both hold the capability ${capability}: a capability is held by one plugin`,
        );
      holder.set(capability, definition!.plugin.name);
    }
  return plugins.flatMap(({ cases }) =>
    cases.map((c) => {
      const plugin = holder.get(c.capability);
      if (plugin === undefined)
        throw new Error(
          `case ${c.name} names the capability ${c.capability}, which no plugin of the deployment holds`,
        );
      return { plugin, ...c };
    }),
  );
}

export async function load(folder: string): Promise<{
  deployment: string;
  cases: LoadedCase[];
  agents: Agent[];
  models: Model[];
}> {
  try {
    const deployment = await definitionIn(join(folder, "index.ts"));
    validateDeployment(deployment);
    const plugins: ReadPlugin[] = [];
    for (const path of deployment.plugins)
      plugins.push(await pluginIn(resolve(folder, path)));
    const cases = casesOf(plugins);
    const agents: Agent[] = [];
    for (const path of deployment.agents) {
      const agent = await definitionIn(resolve(folder, path));
      validateAgent(agent);
      agents.push(agent);
    }
    const models: Model[] = [];
    for (const path of deployment.models) {
      const model = await definitionIn(resolve(folder, path));
      validateModel(model);
      models.push(model);
    }
    return { deployment: deployment.name, cases, agents, models };
  } catch (error) {
    throw new Error(`eval: ${folder}: ${(error as Error).message}`, {
      cause: error,
    });
  }
}
