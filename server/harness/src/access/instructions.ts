/**
 * Access: the user's own instructions for a run. The one place that knows
 * where they come from: the file a deployment names in DEV_USER_INSTRUCTIONS,
 * or, with none named, the text saved on the user's account. An agent config
 * says if the agent takes them.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { AgentDefinition } from "@que/core";

const SETTING = "DEV_USER_INSTRUCTIONS";

/** The most characters of the text saved on an account. A file is read whole. */
export const MAX = 16_000;

export type From = "file" | "account";

/** The file the setting names, taken from the deployment's folder; none when it names none. */
export function fileNamed(
  env: { DEV_USER_INSTRUCTIONS?: string },
  folder: string,
): string | undefined {
  const named = env.DEV_USER_INSTRUCTIONS?.trim();
  if (!named) return undefined;
  return isAbsolute(named) ? named : join(folder, named);
}

export async function fromFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (cause) {
    throw new Error(
      `${SETTING} names ${path}, which cannot be read: ${(cause as Error).message}`,
      { cause },
    );
  }
}

/** The text in use and where it is from. A named file is read each time, so a change to it is in the next chat. */
export async function instructionsOf(
  file: string | undefined,
  account: () => Promise<string | null>,
): Promise<{ text: string | null; from: From }> {
  return file
    ? { text: await fromFile(file), from: "file" }
    : { text: await account(), from: "account" };
}

/** What an agent's prompt gets of the user's text. */
export function taken(
  agent: AgentDefinition,
  text: string | null | undefined,
): string | undefined {
  return agent.userInstructions && text?.trim() ? text : undefined;
}

/** A change to the text of an account: what is saved, or why it is refused. */
export function accepted(
  text: unknown,
  from: From,
): { text: string | null } | { status: 400 | 409; error: string } {
  if (from === "file")
    return {
      status: 409,
      error: `the instructions are set by the file the deployment names in ${SETTING}`,
    };
  if (text === null) return { text: null };
  if (typeof text !== "string")
    return { status: 400, error: "instructions must be text" };
  if (text.length > MAX)
    return {
      status: 400,
      error: `instructions must be at most ${MAX.toLocaleString("en-US")} characters, got ${text.length.toLocaleString("en-US")}`,
    };
  return { text: text.trim() ? text : null };
}
