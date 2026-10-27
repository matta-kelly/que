/**
 * What a domain uses, resolved against the plugins one deployment mounts. A name resolves to a connector's op or
 * skill, never to a domain's: a domain uses connectors only, so there are no chains and no cycles. The names are
 * checked for their form in @que/core (validatePlugin); here, that each one is there.
 */

import { nameIn } from "@que/core";
import type { MountedPlugin } from "./plugins.js";

// A plugin uses others when it names any op or skill of theirs: it is a domain.
const isDomain = ({ definition: { uses } }: MountedPlugin) =>
  uses.ops.length + uses.skills.length > 0;

/** Each op and skill a mounted plugin uses that is its own, said as how to fix it: a plugin uses only others'. */
export function ownUses({ definition, skills }: MountedPlugin): string[] {
  const own = new Set([
    ...definition.ops.map((op) => nameIn(definition.name, op.name)),
    ...skills.map((skill) => skill.id),
  ]);
  return [...definition.uses.ops, ...definition.uses.skills]
    .filter((ref) => own.has(ref))
    .map(
      (ref) =>
        `${definition.name} uses ${ref}, its own: a plugin uses only other plugins' ops and skills`,
    );
}

/**
 * Each name that two mounted plugins give, said as how to fix it. An op's tool name and a skill's id are
 * `<plugin>-<name>`, so plugin odoo's op find-partners and plugin odoo-find's op partners are one name: one of them
 * is renamed.
 */
export function sharedNames(mounted: MountedPlugin[]): string[] {
  const by = new Map<string, string[]>();
  for (const { definition, skills } of mounted)
    for (const name of [
      ...definition.ops.map((op) => nameIn(definition.name, op.name)),
      ...skills.map((skill) => skill.id),
    ])
      by.set(name, [...(by.get(name) ?? []), definition.name]);
  return [...by]
    .filter(([, plugins]) => plugins.length > 1)
    .map(
      ([name, plugins]) =>
        `${name} is a name of ${plugins.join(" and of ")}: rename one op or skill, as each name in a deployment is one tool and one node`,
    );
}

/**
 * Each name a mounted plugin uses that the deployment does not give, said as how to fix it. None when all resolve. A
 * name is an op's or a skill's name in the graph, `<plugin>-<name>`, found among the deployment's plugins.
 */
export function unresolvedUses(mounted: MountedPlugin[]): string[] {
  // Each op and skill of the deployment, by its name, with the plugin that holds it.
  const ops = new Map<string, MountedPlugin>();
  const skills = new Map<string, MountedPlugin>();
  for (const plugin of mounted) {
    for (const op of plugin.definition.ops)
      ops.set(nameIn(plugin.definition.name, op.name), plugin);
    for (const skill of plugin.skills) skills.set(skill.id, plugin);
  }

  // Why a name cannot be used, or nothing when it can.
  const fault = (
    user: string,
    ref: string,
    kind: "op" | "skill",
    found: MountedPlugin | undefined,
  ) => {
    if (!found)
      return [
        `${user} uses ${ref}, and the deployment mounts no ${kind} ${ref}`,
      ];
    if (isDomain(found))
      return [
        `${user} uses ${ref}, and ${found.definition.name} is a domain: a domain uses only a connector's ops and skills`,
      ];
    return [];
  };

  return mounted.flatMap(({ definition: { name: user, uses } }) => [
    ...uses.ops.flatMap((ref) => fault(user, ref, "op", ops.get(ref))),
    ...uses.skills.flatMap((ref) => fault(user, ref, "skill", skills.get(ref))),
  ]);
}
