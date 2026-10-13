/**
 * Mount: read a deployment's loop configs at startup. Each file it is given
 * has one loop as its default export. A loop that breaks the contract
 * (validateLoop in @que/core) fails mounting, and so do two of one name.
 */

import "./supply.js";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { validateLoop, type LoopDefinition } from "@que/core";

export async function mountLoops(files: string[]): Promise<LoopDefinition[]> {
  const loops: LoopDefinition[] = [];

  for (const file of files) {
    if (!existsSync(file))
      throw new Error(`mount: ${file} holds no loop (no such file)`);
    const definition = (
      (await import(pathToFileURL(file).href)) as { default?: unknown }
    ).default;
    try {
      validateLoop(definition);
    } catch (error) {
      throw new Error(`mount: ${file}: ${(error as Error).message}`, {
        cause: error,
      });
    }
    if (loops.some((loop) => loop.name === definition.name))
      throw new Error(
        `mount: ${file}: two loops are named "${definition.name}"`,
      );
    loops.push(definition);
  }
  return loops;
}
