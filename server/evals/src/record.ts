/**
 * What the agent did in a run, from the messages of its thread: each call,
 * each result, and the answer.
 */

import type { Message } from "./que.js";

export type Step =
  | { kind: "call"; name: string; args: unknown }
  | { kind: "result"; name: string; text: string };
/** `answer` is empty when the thread did not end on a message of the agent to the user. */
export type RunRecord = { steps: Step[]; answer: string };

export function record(messages: Message[]): RunRecord {
  const steps = messages.flatMap((message): Step[] => {
    if (message.from === "tool")
      return [{ kind: "result", name: message.tool ?? "", text: message.text }];
    if (message.from === "agent")
      return message.calls.map(({ name, args }) => ({
        kind: "call",
        name,
        args,
      }));
    return [];
  });
  const last = messages.at(-1);
  return {
    steps,
    answer: last?.from === "agent" && !last.calls.length ? last.text : "",
  };
}
