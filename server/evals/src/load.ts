/**
 * What a deployment has to run: its name, the cases of its plugins, its
 * agent configs and its model configs. Read from the deployment's own files,
 * as mount reads them (a plugin by readDefinition, and its card), and checked
 * with the contract. The @que/core range check is mount's alone: it is about
 * the core mount hands a plugin, and the server that runs the cases mounts.
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  checkCard,
  readDefinition,
  validateAgent,
  validateCases,
  validateDeployment,
  validateModel,
  type AgentDefinition,
  type Case,
  type ModelDefinition,
} from "@que/core";

export type LoadedCase = Case & { plugin: string };
/** An agent config, as its file gives it. */
export type Agent = AgentDefinition;
/** A model config, as its file gives it. */
export type Model = ModelDefinition;

const definitionIn = async (file: string): Promise<unknown> =>
  ((await import(pathToFileURL(file).href)) as { default?: unknown }).default;

// A plugin read as mount reads it (readDefinition), its card held to its definition, then its cases.
async function casesOf(dir: string): Promise<LoadedCase[]> {
  const { files, definition } = await readDefinition(dir);
  checkCard(dir, definition);
  const file = files.cases;
  if (!existsSync(file)) return [];
  const cases = await definitionIn(file);
  if (!Array.isArray(cases))
    throw new Error(
      `cases of plugin ${definition.name}: no list of cases (default export)`,
    );
  validateCases(definition, cases as Case[]);
  return (cases as Case[]).map((c) => ({ plugin: definition.name, ...c }));
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
