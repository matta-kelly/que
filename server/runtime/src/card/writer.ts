/**
 * Write a plugin its card, `plugin.json`, from its nodes and its cases: the one way a card is made, when the plugin is
 * published. Nothing of que's reads it back.
 */

import { writeFileSync } from "node:fs";
import { loadPlugin, mountPlugin } from "../mount/plugins.js";
import { cardText, checkedCard } from "@mku1tra/que-plugin";

/** Write the plugin in `dir` its card, from its nodes and its cases, once it mounts on its own. Returns the file's path. */
export async function writeCard(dir: string): Promise<string> {
  await mountPlugin(dir);
  const plugin = await loadPlugin(dir);
  writeFileSync(plugin.files.card, cardText(checkedCard(dir, plugin)));
  return plugin.files.card;
}
