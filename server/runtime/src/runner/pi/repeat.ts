/**
 * The repeat guard on pi: a tool call that fails `REPEAT_MAX` times in a row,
 * with the same arguments and the same error, ends the run, and the user is
 * told the call and the error. The count is read from the saved chat, so a
 * repeat across turns counts.
 *
 * It is in the run of each tool and not a hook: a pi hook can end a run
 * (afterTool) or read the saved chat (beforeRequest), never both. A call that
 * pi refuses for its schema never runs, so the guard does not see it.
 */

import { createHash } from "node:crypto";
import type { Context } from "@earendil-works/chord/context";
import type {
  EntryRecord,
  HookRegistration,
  ToolExecutionApi,
  ToolExecutionResult,
} from "@earendil-works/pi-durable";

export const REPEAT_MAX = 3;

/** No hooks: the guard is `failed`. repeat.test.ts installs this, until its runs get the guard from the tool's run. */
export const repeatGuard: HookRegistration[] = [];

/**
 * The details of a failed call: a digest of its whole error. pi bounds the
 * saved text, and the guard replaces it, so the text is not what is compared.
 */
type Failure = { error: string };

const digest = (error: string) =>
  createHash("sha256").update(error).digest("hex");

/** Every saved entry of the call's conversation, oldest first. */
function saved(api: ToolExecutionApi, context: Context) {
  return api.commit(async (tx) => {
    const entries: EntryRecord[] = [];
    let cursor;
    do {
      const page = await tx.scanEntries(
        { conversationId: api.conversationId, order: "ascending" },
        100,
        cursor,
      );
      entries.push(...page.items);
      cursor = page.next;
    } while (cursor !== undefined);
    return entries;
  }, context);
}

/** The call `callId`, as `name(arguments)`, and how many times in a row it failed with `error` before it. */
function streak(entries: EntryRecord[], callId: string, error: string) {
  const calls = new Map<string, string>();
  const streaks = new Map<string, { error?: string; count: number }>();
  for (const message of entries.flatMap((entry) => entry.model ?? [])) {
    if (message.role === "assistant")
      for (const block of message.content)
        if (block.type === "toolCall")
          calls.set(
            block.id,
            `${block.name}(${JSON.stringify(block.arguments)})`,
          );
    if (message.role !== "toolResult") continue;
    const call = calls.get(message.toolCallId);
    if (call === undefined) continue;
    // A call that answers starts again from zero; one that fails another way, from one.
    if (!message.isError) {
      streaks.delete(call);
      continue;
    }
    const failed = (message.details as Failure | undefined)?.error;
    const before = streaks.get(call);
    streaks.set(call, {
      error: failed,
      count: before && before.error === failed ? before.count + 1 : 1,
    });
  }
  const call = calls.get(callId);
  if (call === undefined) return undefined;
  const before = streaks.get(call);
  return { call, count: before && before.error === error ? before.count : 0 };
}

const text = (text: string) => [{ type: "text" as const, text }];

/**
 * A call's result for its error: the error, or, when it is the call's
 * `REPEAT_MAX`th failure in a row with that error or more, a stop that names
 * the call and the error and ends the run with no other model request.
 */
export async function failed(
  error: string,
  api: ToolExecutionApi,
  context: Context,
): Promise<ToolExecutionResult> {
  const details: Failure = { error: digest(error) };
  const before = streak(await saved(api, context), api.callId, details.error);
  const count = (before?.count ?? 0) + 1;
  if (before === undefined || count < REPEAT_MAX)
    return { isError: true, output: text(error), details };
  return {
    isError: true,
    output: text(
      `I stopped: the call ${before.call} failed ${count} times in a row with the same error: ${error}`,
    ),
    details,
    control: { terminate: true },
  };
}
