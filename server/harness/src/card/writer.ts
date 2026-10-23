/** Write a plugin its card, `plugin.json`, from its definition: the one way a card is made. */

import { writeFileSync } from "node:fs";
import { loadPlugin } from "../mount/plugins.js";
import { cardTextOf } from "@que/core";

/** Write the plugin in `dir` its card, from its definition. Returns the file's path. */
export async function writeCard(dir: string): Promise<string> {
  const { files, definition } = await loadPlugin(dir);
  writeFileSync(files.card, cardTextOf(dir, definition));
  return files.card;
}
