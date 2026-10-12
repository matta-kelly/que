/**
 * Mount: the packages one user can use right now, each with who they are in
 * that service. A package the user has no access to is left out.
 */

import type { ServiceIdentity } from "@que/core";
import { getServiceIdentity, hasAccess } from "./credentials.js";
import { packages, type MountedPackage } from "./packages.js";

/** The user's accessible packages, each with who they're logged in as there (if it can say). */
export type Catalog = { pkg: MountedPackage; identity?: ServiceIdentity }[];

export async function catalogFor(userId: string): Promise<Catalog> {
  const access = await Promise.all(
    packages.map((p) => hasAccess(p.definition, userId)),
  );
  const available = packages.filter((_, i) => access[i]);
  return Promise.all(
    available.map(async (pkg) => ({
      pkg,
      identity: await getServiceIdentity(pkg.definition, userId),
    })),
  );
}
