/**
 * What a domain uses, resolved against the plugins one deployment mounts. A name resolves to a connector's op or
 * skill, never to a domain's: a domain uses connectors only, so there are no chains and no cycles. The names are
 * checked for their form in @que/core (validatePlugin); here, that each one is there.
 */

import type { MountedPlugin } from "./plugins.js";

// A plugin uses others when it names any op or skill of theirs: it is a domain.
const isDomain = ({ definition: { uses } }: MountedPlugin) =>
  uses.ops.length + uses.skills.length > 0;

/** Each name a mounted plugin uses that the deployment does not give, said as how to fix it. None when all resolve. */
export function unresolvedUses(mounted: MountedPlugin[]): string[] {
  const byName = new Map(mounted.map((p) => [p.definition.name, p]));

  // The plugin a name points at, or why it cannot be used.
  const target = (user: string, ref: string, plugin: string) => {
    const found = byName.get(plugin);
    if (!found)
      return `${user} uses ${ref}, and the deployment mounts no plugin ${plugin}`;
    if (isDomain(found))
      return `${user} uses ${ref}, and ${plugin} is a domain: a domain uses only a connector's ops and skills`;
    return found;
  };

  return mounted.flatMap(({ definition: { name: user, uses } }) => [
    ...uses.ops.flatMap((ref) => {
      // A plugin's name has no `_`, so the first one ends it.
      const at = ref.indexOf("_");
      const [plugin, op] = [ref.slice(0, at), ref.slice(at + 1)];
      const found = target(user, ref, plugin);
      if (typeof found === "string") return [found];
      return found.definition.ops.some((o) => o.name === op)
        ? []
        : [`${user} uses ${ref}, and ${plugin} has no op ${op}`];
    }),
    ...uses.skills.flatMap((ref) => {
      const [plugin, skill] = ref.split("/");
      const found = target(user, ref, plugin);
      if (typeof found === "string") return [found];
      return found.skills.some((s) => s.id === ref)
        ? []
        : [`${user} uses ${ref}, and ${plugin} has no skill ${skill}`];
    }),
  ]);
}
