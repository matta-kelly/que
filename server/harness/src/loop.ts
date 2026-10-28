/**
 * A loop config: one way an agent handles a chat as it grows, and how far one run can go. A node of the loop type,
 * which holds settings and no code. A loop is a file of its own, in the deployment's loops/. Framework-free, as the
 * plugin contract is.
 */

import { defineNode, type NodeOf } from "./define.ts";
import { LOOP_DEFAULTS } from "./schema.ts";

export { LOOP_DEFAULTS };

/** What `defineLoop` returns, and a loop file exports as its default. A setting left out keeps que's own value; `false` turns it off. */
export type Loop = NodeOf<"loop">;

type Setting = keyof typeof LOOP_DEFAULTS;

/** Each setting of a loop, by que's list of them. */
const SETTINGS = Object.keys(LOOP_DEFAULTS) as Setting[];

/** A loop with nothing left out: each setting has every value, or is `false`. */
export type ResolvedLoop = Pick<Loop, "name"> & {
  [S in Setting]: Required<Exclude<NonNullable<Loop[S]>, false>> | false;
};

export const defineLoop = defineNode("loop");

/** Every setting of a loop: its own value, que's where it has none, and `false` where it says so. */
export function resolveLoop(loop: Loop): ResolvedLoop {
  return {
    name: loop.name,
    ...Object.fromEntries(
      SETTINGS.map((setting) => [
        setting,
        loop[setting] === false
          ? false
          : { ...LOOP_DEFAULTS[setting], ...loop[setting] },
      ]),
    ),
  } as ResolvedLoop;
}
