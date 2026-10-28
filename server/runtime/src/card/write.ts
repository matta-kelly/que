/**
 * Write each plugin folder it is given its card, `plugin.json`, made from the plugin's nodes, and print each file it
 * wrote: a plugin's publish runs it. A plugin that does not mount on its own, or whose card would break the standard,
 * stops here.
 *
 * `tsx write.ts <plugin folder>...`
 */

import "../mount/supply.js";
import { writeCard } from "./writer.js";

try {
  for (const dir of process.argv.slice(2)) console.log(await writeCard(dir));
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
