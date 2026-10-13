/**
 * Access: the packages of a catalog that the deployment's agent names. It can
 * only take packages out, so a package the user cannot reach stays out.
 */

import type { Catalog } from "./catalog.js";

export function narrow(catalog: Catalog, names?: string[]): Catalog {
  return names
    ? catalog.filter(({ pkg }) => names.includes(pkg.definition.name))
    : catalog;
}
