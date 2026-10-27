/** Write a plugin its card, `plugin.json`, from its definition and its cases: the one way a card is made. */

import { writeFileSync } from "node:fs";
import { loadPlugin } from "../mount/plugins.js";
import { cardText, checkedCard } from "@que/plugin";

/** Write the plugin in `dir` its card, from its definition and its cases. Returns the file's path. */
export async function writeCard(dir: string): Promise<string> {
  const plugin = await loadPlugin(dir);
  writeFileSync(plugin.files.card, cardText(checkedCard(dir, plugin)));
  return plugin.files.card;
}
