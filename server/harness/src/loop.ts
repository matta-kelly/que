/**
 * The contract for a loop config: one way an agent handles a chat as it
 * grows, and how far one run can go. It has a name, and holds settings
 * and no code. A loop is a file of its own, and a deployment lists it.
 * Framework-free, as the plugin contract is.
 */

import * as z from "zod";
import {
  check,
  fieldsOf,
  named,
  standardName,
  strict,
} from "@mku1tra/que-plugin";
import { types } from "./ontology.ts";
import { LOOP_DEFAULTS } from "./schema.ts";

export { LOOP_DEFAULTS };

/** What `defineLoop` returns, and a loop file exports as its default. A setting left out keeps que's own value; `false` turns it off. */
export const Loop = z.strictObject(
  {
    /** What an agent names to get this loop. */
    name: standardName,
    ...fieldsOf(types.loop),
  },
  strict(),
);

export type Loop = z.infer<typeof Loop>;

/** A loop with nothing left out: each setting has every value, or is `false`. */
export type ResolvedLoop = {
  name: string;
  result: { max: number } | false;
  summarize: { at: number; keep: number } | false;
  args: { max: number } | false;
  limits: { modelCalls: number; toolCalls: number } | false;
};

export function defineLoop(definition: Loop): Loop {
  return definition;
}

type Setting = keyof typeof LOOP_DEFAULTS;

/**
 * Check a loop against the contract, throwing one error that lists every
 * problem. Types can't catch these: a loop is loaded at runtime.
 */
export function validateLoop(def: unknown): asserts def is Loop {
  check(Loop, def, `loop${named(def)} is invalid`);
}

/** Every setting of a loop: its own value, que's where it has none, and `false` where it says so. */
export function resolveLoop(loop: Loop): ResolvedLoop {
  const setting = <S extends Setting>(name: S) =>
    loop[name] === false
      ? false
      : { ...LOOP_DEFAULTS[name], ...(loop[name] as object | undefined) };
  return {
    name: loop.name,
    result: setting("result"),
    summarize: setting("summarize"),
    args: setting("args"),
    limits: setting("limits"),
  } as ResolvedLoop;
}
