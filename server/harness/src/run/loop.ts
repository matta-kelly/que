/**
 * The loop a run is built with: the one its config names, out of the ones the
 * deployment lists, with que's own value for each setting it leaves out. A
 * config that names none gets que's own value for each setting.
 */

import {
  resolveLoop,
  type AgentDefinition,
  type LoopDefinition,
  type ResolvedLoop,
} from "@que/core";

/** What a run is built with when its config names no loop. */
export const OWN_LOOP: LoopDefinition = { name: "default" };

export function loopFor(
  loops: LoopDefinition[],
  config: AgentDefinition,
): ResolvedLoop {
  if (config.loop === undefined) return resolveLoop(OWN_LOOP);
  const named = loops.find((loop) => loop.name === config.loop);
  // Mount stops on a loop that is not listed, so this is a config that did not come through mount.
  if (!named) throw new Error(`no loop ${JSON.stringify(config.loop)}`);
  return resolveLoop(named);
}
