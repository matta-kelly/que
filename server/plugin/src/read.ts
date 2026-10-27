/**
 * Read a plugin from its folder: where its files are (layout.ts), its definition, checked against the contract, and
 * its cases, checked against it. Mount, the evals and the card's writer read a plugin this way; mount and the evals
 * then hold its card to it (checkCard).
 */

import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { validateCases, type Case } from "./case.ts";
import type { PluginDefinition } from "./contract.ts";
import { locatePlugin, type PluginFiles } from "./layout.ts";
import { validatePlugin } from "./lint.ts";

const defaultOf = async (file: string): Promise<unknown> =>
  ((await import(pathToFileURL(file).href)) as { default?: unknown }).default;

/** The plugin in `dir`: its files, its definition and its cases, checked. Throws naming the folder and the fault. */
export async function readDefinition(dir: string): Promise<{
  files: PluginFiles;
  definition: PluginDefinition;
  cases: Case[];
}> {
  const files = locatePlugin(dir);
  const definition = (await defaultOf(files.definition)) as
    PluginDefinition | undefined;
  try {
    validatePlugin(definition);
  } catch (error) {
    throw new Error(`${dir}: ${(error as Error).message}`, { cause: error });
  }
  if (!existsSync(files.cases)) return { files, definition, cases: [] };
  const cases = await defaultOf(files.cases);
  try {
    if (!Array.isArray(cases))
      throw new Error(
        `cases of plugin ${definition.name}: no list of cases (default export)`,
      );
    validateCases(definition, cases as Case[]);
  } catch (error) {
    throw new Error(`${dir}: ${(error as Error).message}`, { cause: error });
  }
  return { files, definition, cases: cases as Case[] };
}
