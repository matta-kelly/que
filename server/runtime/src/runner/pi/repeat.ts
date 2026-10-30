/**
 * The repeat guard on pi: a tool call that fails `REPEAT_MAX` times in a row,
 * with the same arguments and the same error, ends the run, and the user is
 * told the call and the error. The count is kept with the conversation, so a
 * repeat across turns counts, and only from the chat's head on, so a failure
 * a summary replaced does not.
 *
 * It is in the run of each tool and not a hook: a pi hook can end a run
 * (afterTool) or read the conversation's state (beforeRequest), never both. A
 * call that pi refuses for its schema never runs, so the guard does not see it.
 */

import { createHash } from "node:crypto";
import type { Context } from "@earendil-works/chord/context";
import {
  defineDoc,
  type ToolExecutionApi,
  type ToolExecutionResult,
} from "@earendil-works/pi-durable";

export const REPEAT_MAX = 3;

/**
 * Each call that failed the last time it ran, by `name(arguments)`: a digest
 * of its whole error (pi bounds the saved text, and the stop replaces it), and
 * the place of each time in a row it failed with it, the newest entry of the
 * chat then. A fork has the streaks of the chat it keeps.
 */
const Streaks = defineDoc<{
  calls: Record<string, { error: string; at: number[] }>;
}>({
  kind: "que.repeat",
  version: 2,
  scope: "conversation",
  history: "rewindable",
  fork: "asOf",
  initial: () => ({ calls: {} }),
  // Version 1 kept a count and no places: its streaks start again.
  migrate: () => ({ calls: {} }),
  checkpointWhen: () => false,
});

/** The details of a stop: the run ends on it, also beside other calls of its round (harness.ts). */
const STOP = { que: "stop" } as const;

/** Whether a tool result's details say the repeat guard stopped on it. */
export const isStop = (details: unknown) =>
  typeof details === "object" &&
  details !== null &&
  "que" in details &&
  details.que === STOP.que;

const digest = (error: string) =>
  createHash("sha256").update(error).digest("hex");

const text = (text: string) => [{ type: "text" as const, text }];

/** A call that answered starts again from zero. */
export async function answered(
  call: string,
  api: ToolExecutionApi,
  context: Context,
) {
  const streaks = await api.snapshot(Streaks, api.conversationId, context);
  if (streaks?.calls[call] === undefined) return;
  await api.commit(async (tx) => {
    delete (await tx.doc(Streaks, api.conversationId)).calls[call];
  }, context);
}

/**
 * The result of `call` for its error: the error, or, when it is the call's
 * `REPEAT_MAX`th failure in a row with that error or more, a stop that names
 * the call and the error and ends the run with no other model request. A
 * failure counts only from the chat's head on: one a summary replaced does
 * not, as LangGraph's summary removed the turns it replaced.
 */
export async function failed(
  call: string,
  error: string,
  api: ToolExecutionApi,
  context: Context,
): Promise<ToolExecutionResult> {
  const failure = digest(error);
  const count = await api.commit(async (tx) => {
    const head = (await tx.latestHeadMarker(api.conversationId))?.head ?? 0;
    const [newest] = (
      await tx.scanEntries({ conversationId: api.conversationId }, 1)
    ).items;
    const { calls } = await tx.doc(Streaks, api.conversationId);
    const before = calls[call];
    // A failure's place is at or after its call's response, and before the next one, so a head is never between.
    const kept =
      before?.error === failure ? before.at.filter((at) => at >= head) : [];
    calls[call] = { error: failure, at: [...kept, newest?.id ?? 0] };
    return calls[call].at.length;
  }, context);
  if (count < REPEAT_MAX) return { isError: true, output: text(error) };
  return {
    isError: true,
    output: text(
      `I stopped: the call ${call} failed ${count} times in a row with the same error: ${error}`,
    ),
    details: STOP,
    control: { terminate: true },
  };
}
