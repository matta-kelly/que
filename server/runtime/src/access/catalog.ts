/**
 * Mount: the plugins one user can use right now, each with who they are in
 * that service. A plugin the user has no access to is left out.
 */

import type { ServiceIdentity } from "@mku1tra/que-plugin";
import { access } from "./connections.js";
import { plugins } from "../mount/mounted.js";
import type { MountedPlugin } from "../mount/plugins.js";

/** The user's accessible plugins, each with who they're logged in as there (if it can say). */
export type Catalog = { plugin: MountedPlugin; identity?: ServiceIdentity }[];

export async function catalogFor(userId: string): Promise<Catalog> {
  const reachable = await Promise.all(
    plugins.map((p) => access.hasAccess(p.definition.plugin, userId)),
  );
  const available = plugins.filter((_, i) => reachable[i]);
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
