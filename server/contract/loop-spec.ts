/**
 * The contract for a loop config: one way an agent handles a chat as it
 * grows, and how far one run can go. It has a name, and holds settings and no
 * code. A loop is a file of its own, and a deployment lists it.
 * Framework-free, as the package contract is.
 */

import { NAME } from "./package-spec.js";

/** What `defineLoop` returns, and a loop file exports as its default. A setting left out keeps que's own value; `false` turns it off. */
export type LoopDefinition = {
  /** What an agent names to get this loop. */
  name: string;
  /** `max`: in tokens. A tool result over it is not put in the chat whole. */
  result?: { max?: number } | false;
  /** `at`: the share of the model's window past which the old part of the chat is sent as a summary. `keep`: the share that is sent as it is. */
  summarize?: { at?: number; keep?: number } | false;
  /** `max`: in characters. In the old part of a chat, a longer argument of a tool call is cut. */
  args?: { max?: number } | false;
  /** The most model calls and tool calls one run can make. */
  limits?: { modelCalls?: number; toolCalls?: number } | false;
};

/** A loop with nothing left out: each setting has every value, or is `false`. */
export type ResolvedLoop = {
  name: string;
  result: { max: number } | false;
  summarize: { at: number; keep: number } | false;
  args: { max: number } | false;
  limits: { modelCalls: number; toolCalls: number } | false;
};

/** que's own value for each setting. */
export const LOOP_DEFAULTS = {
  result: { max: 20_000 },
  summarize: { at: 0.85, keep: 0.1 },
  args: { max: 2_000 },
  limits: { modelCalls: 50, toolCalls: 100 },
} as const;

export function defineLoop(definition: LoopDefinition): LoopDefinition {
  return definition;
}

type Setting = keyof typeof LOOP_DEFAULTS;
const SETTINGS = Object.keys(LOOP_DEFAULTS) as Setting[];

const isCount = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value > 0;
const isShare = (value: unknown) =>
  typeof value === "number" && value > 0 && value < 1;

/**
 * Check a loop against the contract, throwing one error that lists every
 * problem. Types can't catch these: a loop is loaded at runtime.
 */
export function validateLoop(def: unknown): asserts def is LoopDefinition {
  if (!def || typeof def !== "object" || Array.isArray(def))
    throw new Error("loop must be an object");
  const loop = def as Record<string, unknown>;
  const { name } = loop;
  const problems: string[] = [];
  const named = typeof name === "string" && NAME.test(name);

  if (typeof name !== "string" || !name.trim())
    problems.push("name of the loop is missing");
  else if (!named) problems.push(`loop name "${name}" must match ${NAME}`);
  for (const field of Object.keys(loop))
    if (field !== "name" && !SETTINGS.includes(field as Setting))
      problems.push(`the loop has no field "${field}"`);

  for (const setting of SETTINGS) {
    const value = loop[setting];
    if (value === undefined || value === false) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      problems.push(`${setting} of the loop must be an object or false`);
      continue;
    }
    const fields = value as Record<string, unknown>;
    const share = setting === "summarize";
    for (const [field, given] of Object.entries(fields)) {
      if (!(field in LOOP_DEFAULTS[setting]))
        problems.push(`${setting} of the loop has no field "${field}"`);
      else if (given !== undefined && !(share ? isShare : isCount)(given))
        problems.push(
          `${setting}.${field} of the loop must be ${share ? "a number above zero and below one" : "a whole number above zero"}, got ${JSON.stringify(given)}`,
        );
    }
    if (share) {
      // Checked on what the loop runs with, so a part left out counts as que's own.
      const { at, keep } = { ...LOOP_DEFAULTS.summarize, ...fields };
      if (isShare(at) && isShare(keep) && keep >= at)
        problems.push(
          `summarize.keep of the loop must be below summarize.at, got ${keep} and ${at}`,
        );
    }
  }

  if (problems.length)
    throw new Error(
      `loop${named ? ` ${name}` : ""} is invalid:\n- ${problems.join("\n- ")}`,
    );
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
