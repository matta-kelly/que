/**
 * Mount: the plugins one user can use right now, each with who they are in
 * that service. The user's granted domains, and each connector they reach
 * whose login resolves. A plugin a granted domain does not name is left out.
 */

import type { ServiceIdentity } from "@mku1tra/que-plugin";
import { access } from "./connections.js";
import { control } from "./control.js";
import { plugins } from "../mount/mounted.js";
import type { MountedPlugin } from "../mount/plugins.js";

/** The user's accessible plugins, each with who they're logged in as there (if it can say). */
export type Catalog = { plugin: MountedPlugin; identity?: ServiceIdentity }[];

export async function catalogFor(userId: string): Promise<Catalog> {
  const reach = await control.reachOf(userId);
  const named = new Set([
    ...reach.domains,
    ...reach.connectors.map(({ name }) => name),
  ]);
  const reached = plugins.filter((p) => named.has(p.definition.plugin.name));
  const reachable = await Promise.all(
    reached.map((p) => access.hasAccess(p.definition.plugin, userId)),
  );
  const available = reached.filter((_, i) => reachable[i]);
  return Promise.all(
    available.map(async (plugin) => ({
      plugin,
      identity: await access.getServiceIdentity(
        plugin.definition.plugin,
        userId,
      ),
    })),
  );
}
