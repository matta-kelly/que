/**
 * Mount: which deployment que starts from. The environment names its folder,
 * so one build can start as any deployment.
 */

import { isAbsolute, resolve } from "node:path";

export function deploymentFolder(
  env: { QUE_DEPLOYMENT?: string },
  base: string,
): string {
  const named = env.QUE_DEPLOYMENT;
  if (!named?.trim())
    throw new Error(
      "mount: QUE_DEPLOYMENT is not set. It names the deployment folder que starts from",
    );
  return isAbsolute(named) ? named : resolve(base, named);
}
