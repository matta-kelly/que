/**
 * What a deployment has to run: its name, the cases of its plugins, its
 * agent configs and its model configs. Read from the deployment's own files,
 * as mount reads them (a plugin by readDefinition, and its card), and checked
 * with the contract. The @mku1tra/que-plugin range check is mount's alone: it is about
 * the @mku1tra/que-plugin mount hands a plugin, and the server that runs the cases mounts.
 */

import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkCard, readDefinition, type Case } from "@mku1tra/que-plugin";
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

// A plugin read as mount reads it (readDefinition): its cases checked, and its card held to them and its definition.
async function casesOf(dir: string): Promise<LoadedCase[]> {
  const plugin = await readDefinition(dir);
  checkCard(dir, plugin);
  return plugin.cases.map((c) => ({ plugin: plugin.definition.name, ...c }));
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
    const cases: LoadedCase[] = [];
    for (const path of deployment.plugins)
      cases.push(...(await casesOf(resolve(folder, path))));
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
