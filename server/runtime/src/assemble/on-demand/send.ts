/**
 * Which operations go out with each model request: the ones this chat has
 * loaded.
 */

import type { BaseMessage } from "langchain";
import { LOAD_OPERATION } from "./tools.js";

type ToolCall = { id?: string; name: string; args: Record<string, unknown> };

/**
 * Tool names of the operations loaded so far. Read from the chat's own
 * messages, so a chat that is reopened has the same operations in reach.
 */
export function loadedOperations(messages: BaseMessage[]): Set<string> {
  const succeeded = new Set(
    messages.flatMap((m) => {
      const { tool_call_id: id, status } = m as {
        tool_call_id?: string;
        status?: string;
      };
      return id && status !== "error" ? [id] : [];
    }),
  );
  return new Set(
    messages
      .flatMap((m) => (m as { tool_calls?: ToolCall[] }).tool_calls ?? [])
      .filter((call) => call.name === LOAD_OPERATION && succeeded.has(call.id!))
      .map((call) => String(call.args.operation)),
  );
}

export function send(messages: BaseMessage[], operations: string[]) {
  const loaded = loadedOperations(messages);
  return operations.filter((name) => loaded.has(name));
}
