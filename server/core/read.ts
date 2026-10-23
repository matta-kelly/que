/**
 * Read a plugin from its folder: where its files are (layout.ts), and its definition, checked against the
 * contract. Mount, the evals and the card's writer read a plugin this way; mount and the evals then hold its
 * card to it (checkCard).
 */

import { pathToFileURL } from "node:url";
import { locatePlugin, type PluginFiles } from "./layout.js";
import { validatePlugin, type PluginDefinition } from "./plugin.js";

/** The plugin in `dir`: its files, and its definition, checked. Throws naming the folder and the fault. */
export async function readDefinition(dir: string): Promise<{
  files: PluginFiles;
  definition: PluginDefinition;
}> {
  const files = locatePlugin(dir);
  const definition = (
    (await import(pathToFileURL(files.definition).href)) as {
      default?: PluginDefinition;
    }
  ).default;
  try {
    validatePlugin(definition);
  } catch (error) {
    throw new Error(`${dir}: ${(error as Error).message}`, { cause: error });
  }
  return { files, definition };
}
