/**
 * The card check of `just check-folder`: each folder it is given that holds a plugin must have a card that is
 * exactly what its definition makes. A plugin in the old layout fails, as at mount. A folder that holds no plugin
 * is not checked here. Prints nothing when
 * every card is right, and each fault when one is not.
 *
 * `tsx check.ts <folder>...`
 */

import "../mount/supply.js";
import { checkCard, holdsPlugin } from "@que/core";
import { loadPlugin } from "../mount/plugins.js";

const faults: string[] = [];
for (const dir of process.argv.slice(2)) {
  if (!holdsPlugin(dir)) continue;
  try {
    checkCard(dir, (await loadPlugin(dir)).definition);
  } catch (error) {
    faults.push((error as Error).message);
  }
}
if (faults.length) {
  console.error(faults.join("\n"));
  process.exit(1);
}
