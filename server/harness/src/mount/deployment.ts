/**
 * Mount: read a deployment from disk. A deployment is a folder whose index.ts
 * has its definition as the default export. A definition that breaks the
 * contract (validateDeployment in @que/core) fails mounting, and so does an
 * agent that names a package the deployment does not mount.
 */

import "./supply.js";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateDeployment, type AgentDefinition } from "@que/core";
import { deploymentFolder } from "./deployment-folder.js";
import { mountPackages, type MountedPackage } from "./packages.js";

export async function loadDeployment(
  dir: string,
): Promise<{ name: string; packages: string[]; agent: AgentDefinition }> {
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
    agent: definition.agent ?? {},
  };
}

export async function mountDeployment(
  dir: string,
): Promise<{ packages: MountedPackage[]; agent: AgentDefinition }> {
  const { packages: folders, agent } = await loadDeployment(dir);
  const packages = await mountPackages(folders);
  const mounted = packages.map((p) => p.definition.name);
  const unmounted = (agent.packages ?? []).filter(
    (name) => !mounted.includes(name),
  );
  if (unmounted.length)
    throw new Error(
      `mount: deployment ${dir}: the agent names packages the deployment does not mount: ${unmounted.join(", ")}`,
    );
  return { packages, agent };
}

export async function mountFromEnv(env: {
  QUE_DEPLOYMENT?: string;
}): Promise<MountedPackage[]> {
  return (await mountDeployment(deploymentFolder(env))).packages;
}
