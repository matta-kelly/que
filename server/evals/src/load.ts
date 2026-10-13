/**
 * What a deployment has to run: its name, the cases of its packages, its
 * agent configs and its model configs. Read from the deployment's own files,
 * as mount reads them, and checked with the contract.
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  validateAgent,
  validateCases,
  validateDeployment,
  validateModel,
  validatePackage,
  type AgentDefinition,
  type Case,
  type ModelDefinition,
  type PackageDefinition,
} from "@que/core";

export type LoadedCase = Case & { package: string };
/** An agent config, as its file gives it. */
export type Agent = AgentDefinition;
/** A model config, as its file gives it. */
export type Model = ModelDefinition;

const definitionIn = async (file: string): Promise<unknown> =>
  ((await import(pathToFileURL(file).href)) as { default?: unknown }).default;

async function casesOf(dir: string): Promise<LoadedCase[]> {
  const definition = (await definitionIn(join(dir, "index.ts"))) as
    PackageDefinition | undefined;
  validatePackage(definition);
  const file = join(dir, "cases.ts");
  if (!existsSync(file)) return [];
  const cases = await definitionIn(file);
  if (!Array.isArray(cases))
    throw new Error(
      `cases of package ${definition.name}: no list of cases (default export)`,
    );
  validateCases(definition, cases as Case[]);
  return (cases as Case[]).map((c) => ({ package: definition.name, ...c }));
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
    for (const path of deployment.packages)
      cases.push(...(await casesOf(resolve(folder, path))));
    const agents: Agent[] = [];
    for (const path of deployment.agents ?? []) {
      const agent = await definitionIn(resolve(folder, path));
      validateAgent(agent);
      agents.push(agent);
    }
    const models: Model[] = [];
    for (const path of deployment.models ?? []) {
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
