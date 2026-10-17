/**
 * Mounts a deployment with no `.env` and no network, then prints the folder of
 * each package it lists, one per line. A deployment that would not mount stops
 * here, with mount's error. A package can sit outside the deployment's folder
 * (a repo's own `packages/`), so `just check-deployment` asks for this list
 * rather than looking only inside the deployment.
 *
 * A model's window and price come from its file or from the deployment's saved
 * copy of facts, not from a source. One that is in neither is unknown, and
 * mount refuses it. With no `.env`, a `MODEL` setting is not seen.
 *
 * `tsx check-deployment.ts <deployment folder>`
 */

import { loadDeployment, mountDeployment } from "./deployment.js";
import type { FactSources } from "./model-facts/index.js";
import { savedFacts } from "./model-facts/saved.js";

const dir = process.argv[2];
// The sources ask no one: a fact the deployment's saved copy does not hold is unknown, and mount says how to write it.
const saved = savedFacts(dir).read();
const unknown = {
  reason:
    "the check reads no network (`just start` once saves it in .que/)",
};
const offline: FactSources = {
  window: async (model) => {
    const window = (await saved)[model.id]?.window;
    return window === undefined ? unknown : { window };
  },
  price: async (model) => {
    const price = (await saved)[model.id]?.price;
    return price === undefined ? unknown : { price };
  },
  done: async () => {},
};

try {
  await mountDeployment(dir, {}, offline);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
for (const folder of (await loadDeployment(dir)).packages) console.log(folder);
