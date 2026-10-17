/**
 * The repeat guard: a tool call that fails `max` times in a row, with the same
 * arguments and the same error, ends the run, and the user is told the call
 * and the error. A stuck agent does not keep paying for the same error. The
 * count is read from the saved chat, so a repeat across turns counts.
 */

import {
  AIMessage,
  ToolMessage,
  createMiddleware,
  type BaseMessage,
} from "langchain";

const text = (message: BaseMessage) =>
  typeof message.content === "string"
    ? message.content
    : JSON.stringify(message.content);

/** The newest call that has failed `max` times in a row the same way, if one of the newest results is one. */
function repeated(messages: BaseMessage[], max: number) {
  const calls = new Map<string, string>();
  const streaks = new Map<string, { error: string; count: number }>();
  let stuck: { call: string; error: string } | undefined;
  for (const message of messages) {
    // Only a result since the model's last reply can end the run. One from before it ended a run already, or did not.
    if (AIMessage.isInstance(message)) {
      stuck = undefined;
      for (const call of message.tool_calls ?? [])
        if (call.id)
          calls.set(call.id, `${call.name}(${JSON.stringify(call.args)})`);
    }
    if (!ToolMessage.isInstance(message)) continue;
    const call = calls.get(message.tool_call_id);
    if (!call) continue;
    // A call that answers, or fails another way, starts again from zero.
    if (message.status !== "error") {
      streaks.delete(call);
      continue;
    }
    const error = text(message);
    const before = streaks.get(call);
    const count = before?.error === error ? before.count + 1 : 1;
    streaks.set(call, { error, count });
    if (count >= max) stuck = { call, error };
  }
  return stuck;
}

export const repeatGuard = (max: number) =>
  createMiddleware({
    name: "RepeatGuard",
    beforeModel: {
      canJumpTo: ["end"],
      hook: ({ messages }) => {
        const stuck = repeated(messages, max);
        if (!stuck) return;
        return {
          messages: [
            new AIMessage(
              `I stopped: the call ${stuck.call} failed ${max} times in a row with the same error: ${stuck.error}`,
            ),
          ],
          jumpTo: "end",
        };
      },
    },
  });
