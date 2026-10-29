/**
 * Mounts a deployment, which lints it from its root, then prints the folder of
 * each plugin it lists, one per line. A deployment that would not mount stops
 * here, with mount's error. A plugin can sit outside the deployment's folder
 * (a repo's own `plugins/`, in the root that holds both), so
 * `just check-deployment` asks for this list rather than looking only inside
 * the deployment. No network: a model's window and price are its file's, or
 * the installed model catalog's, and no `.env` is read.
 *
 * `tsx check-deployment.ts <deployment folder>`
 */

import { readDeployment } from "@mku1tra/que-harness";
import { mountDeployment } from "./deployment.js";

const dir = process.argv[2];

try {
  await mountDeployment(dir);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
// Each by its real folder (readDeployment): a plugin is installed as a link, and its code is checked where it is.
for (const plugin of (await readDeployment(dir)).plugins)
  console.log(plugin.dir);
