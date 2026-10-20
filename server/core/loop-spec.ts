/**
 * The contract for a loop config: one way an agent handles a chat as it
 * grows, and how far one run can go. It has a name, and holds settings
 * and no code. A loop is a file of its own, and a deployment lists it.
 * Framework-free, as the package contract is.
 */

import * as z from "zod";
import { check, isCount, name, named, strict, that } from "./check.js";

/** que's own value for each setting. */
export const LOOP_DEFAULTS = {
  result: { max: 20_000 },
  summarize: { at: 0.85, keep: 0.1 },
  args: { max: 2_000 },
  limits: { modelCalls: 50, toolCalls: 100 },
} as const;

const isShare = (value: unknown): value is number =>
  typeof value === "number" && value > 0 && value < 1;

const count = that(isCount, "a whole number above zero").optional();
const share = that(isShare, "a number above zero and below one").optional();

// A setting is its own fields, or `false` to turn it off.
const setting = <S extends z.ZodRawShape>(fields: z.ZodObject<S>) =>
  z
    .union([z.literal(false), fields], { error: "must be an object or false" })
    .optional();

/** What `defineLoop` returns, and a loop file exports as its default. A setting left out keeps que's own value; `false` turns it off. */
export const LoopDefinition = z.strictObject(
  {
    /** What an agent names to get this loop. */
    name,
    /** `max`: in tokens. A tool result over it is not put in the chat whole. */
    result: setting(z.strictObject({ max: count }, strict())),
    /** `at`: the share of the model's window past which the old part of the chat is sent as a summary. `keep`: the share that is sent as it is. */
    summarize: setting(
      z
        .strictObject({ at: share, keep: share }, strict())
        .superRefine((fields, ctx) => {
          // Checked on what the loop runs with, so a part left out counts as que's own.
          const { at, keep } = { ...LOOP_DEFAULTS.summarize, ...fields };
          if (isShare(at) && isShare(keep) && keep >= at)
            ctx.addIssue({
              code: "custom",
              path: ["keep"],
              message: `must be below summarize.at, got ${keep} and ${at}`,
            });
        }),
    ),
    /** `max`: in characters. In the old part of a chat, a longer argument of a tool call is cut. */
    args: setting(z.strictObject({ max: count }, strict())),
    /** The most model calls and tool calls one run can make. */
    limits: setting(
      z.strictObject({ modelCalls: count, toolCalls: count }, strict()),
    ),
  },
  strict(),
);

export type LoopDefinition = z.infer<typeof LoopDefinition>;

/** A loop with nothing left out: each setting has every value, or is `false`. */
export type ResolvedLoop = {
  name: string;
  result: { max: number } | false;
  summarize: { at: number; keep: number } | false;
  args: { max: number } | false;
  limits: { modelCalls: number; toolCalls: number } | false;
};

export function defineLoop(definition: LoopDefinition): LoopDefinition {
  return definition;
}

type Setting = keyof typeof LOOP_DEFAULTS;

/**
 * Check a loop against the contract, throwing one error that lists every
 * problem. Types can't catch these: a loop is loaded at runtime.
 */
export function validateLoop(def: unknown): asserts def is LoopDefinition {
  check(LoopDefinition, def, `loop${named(def)} is invalid`);
}

/** Every setting of a loop: its own value, que's where it has none, and `false` where it says so. */
export function resolveLoop(loop: LoopDefinition): ResolvedLoop {
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
