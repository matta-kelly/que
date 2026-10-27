/**
 * Mount: the plugins one user can use right now, each with who they are in
 * that service. A plugin the user has no access to is left out.
 */

import type { ServiceIdentity } from "@mku1tra/que-plugin";
import { getServiceIdentity, hasAccess } from "./connections.js";
import { plugins } from "../mount/mounted.js";
import type { MountedPlugin } from "../mount/plugins.js";

/** The user's accessible plugins, each with who they're logged in as there (if it can say). */
export type Catalog = { plugin: MountedPlugin; identity?: ServiceIdentity }[];

export async function catalogFor(userId: string): Promise<Catalog> {
  const access = await Promise.all(
    plugins.map((p) => hasAccess(p.definition, userId)),
  );
  const available = plugins.filter((_, i) => access[i]);
  return Promise.all(
    available.map(async (plugin) => ({
      plugin,
      identity: await getServiceIdentity(plugin.definition, userId),
    })),
  );
}
