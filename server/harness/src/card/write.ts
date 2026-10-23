/**
 * Write each plugin folder it is given its card, `plugin.json`, made from the plugin's definition, and print
 * each file it wrote. A plugin that breaks the contract, or whose card would break the standard, stops here.
 *
 * `tsx write.ts <plugin folder>...`
 */

import "../mount/supply.js";
import { writeCard } from "./card.js";

try {
  for (const dir of process.argv.slice(2)) console.log(await writeCard(dir));
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
