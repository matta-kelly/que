/**
 * Mount: read a deployment from disk. A deployment is a folder whose index.ts
 * has its definition as the default export. A definition that breaks the
 * contract (validateDeployment in @que/core) fails mounting.
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateDeployment } from "@que/core";
import { deploymentFolder } from "./deployment-folder.js";
import { mountPackages, type MountedPackage } from "./packages.js";

const HARNESS = join(import.meta.dirname, "../../..");

export async function loadDeployment(
  dir: string,
): Promise<{ name: string; packages: string[] }> {
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
  };
}

export async function mountFromEnv(env: {
  QUE_DEPLOYMENT?: string;
}): Promise<MountedPackage[]> {
  return mountPackages(
    (await loadDeployment(deploymentFolder(env, HARNESS))).packages,
  );
}
