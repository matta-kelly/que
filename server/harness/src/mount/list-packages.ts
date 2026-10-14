/**
 * Prints the folder of each package a deployment lists, one per line, as mount
 * resolves them. A package can sit outside the deployment's folder (a repo's
 * own `packages/`), so `just check-deployment` asks for this list rather than
 * looking only inside the deployment.
 *
 * `tsx list-packages.ts <deployment folder>`
 */

import { loadDeployment } from "./deployment.js";

for (const folder of (await loadDeployment(process.argv[2])).packages)
  console.log(folder);
