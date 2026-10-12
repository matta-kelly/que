/**
 * Mount: which deployment que starts from. A deployment starts que and hands
 * it its own folder in QUE_DEPLOYMENT, so que holds no setting that picks one.
 */

import { isAbsolute } from "node:path";

const HOW = "A deployment's start script sets it to its own folder";

export function deploymentFolder(env: { QUE_DEPLOYMENT?: string }): string {
  const named = env.QUE_DEPLOYMENT;
  if (!named?.trim())
    throw new Error(`mount: QUE_DEPLOYMENT is not set. ${HOW}`);
  if (!isAbsolute(named))
    throw new Error(
      `mount: QUE_DEPLOYMENT must be an absolute path, got "${named}". ${HOW}`,
    );
  return named;
}
