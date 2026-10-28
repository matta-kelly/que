/**
 * Access: the plugins of a catalog that the deployment's agent names. It can
 * only take plugins out, so a plugin the user cannot reach stays out.
 */

import type { Catalog } from "./catalog.js";

export function narrow(catalog: Catalog, names: string[]): Catalog {
  return catalog.filter(({ plugin }) =>
    names.includes(plugin.definition.plugin.name),
  );
}
