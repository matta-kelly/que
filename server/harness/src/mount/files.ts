/**
 * Mount: read a list of config files at startup. Each file has one config as
 * its default export. A config that breaks its contract fails mounting, and
 * so do two of one name. Agents, loops and models are all read this way.
 */

import "./supply.js";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

export async function mountFiles<T extends { name: string }>(
  files: string[],
  kind: string,
  validate: (definition: unknown) => asserts definition is T,
): Promise<T[]> {
  const mounted: T[] = [];

  for (const file of files) {
    if (!existsSync(file))
      throw new Error(`mount: ${file} holds no ${kind} (no such file)`);
    const definition = (
      (await import(pathToFileURL(file).href)) as { default?: unknown }
    ).default;
    try {
      validate(definition);
    } catch (error) {
      throw new Error(`mount: ${file}: ${(error as Error).message}`, {
        cause: error,
      });
    }
    if (mounted.some((other) => other.name === definition.name))
      throw new Error(
        `mount: ${file}: two ${kind}s are named "${definition.name}"`,
      );
    mounted.push(definition);
  }
  return mounted;
}
