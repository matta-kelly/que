/**
 * The repeat guard: a tool call that fails `REPEAT_MAX` times in a row, with
 * the same arguments and the same error, ends the run, and the user is told the
 * call and the error. A stuck agent does not keep paying for the same error.
 * The count is read from the saved chat, so a repeat across turns counts. On
 * for every agent, and not a setting of a loop.
 */

import {
  AIMessage,
  ToolMessage,
  createMiddleware,
  type BaseMessage,
} from "langchain";

export const REPEAT_MAX = 3;

const text = (message: BaseMessage) =>
  typeof message.content === "string"
    ? message.content
    : JSON.stringify(message.content);

/** The call that has failed `REPEAT_MAX` times or more in a row the same way, if one of the newest results is one. */
function repeated(messages: BaseMessage[]) {
  const calls = new Map<string, string>();
  const streaks = new Map<string, { error: string; count: number }>();
  let stuck: { call: string; error: string; count: number } | undefined;
  for (const message of messages) {
    // Only a result that no message follows can end the run. After a reply of the model or a new message of the user, the model is called.
    if (!ToolMessage.isInstance(message)) {
      stuck = undefined;
      if (AIMessage.isInstance(message))
        for (const call of message.tool_calls ?? [])
          if (call.id)
            calls.set(call.id, `${call.name}(${JSON.stringify(call.args)})`);
      continue;
    }
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
    if (count >= REPEAT_MAX) stuck = { call, error, count };
  }
  return stuck;
}

export const repeatGuard = () =>
  createMiddleware({
    name: "RepeatGuard",
    beforeModel: {
      canJumpTo: ["end"],
      hook: ({ messages }) => {
        const stuck = repeated(messages);
        if (!stuck) return;
        return {
          messages: [
            new AIMessage(
              `I stopped: the call ${stuck.call} failed ${stuck.count} times in a row with the same error: ${stuck.error}`,
            ),
          ],
          jumpTo: "end",
        };
      },
    },
  });
