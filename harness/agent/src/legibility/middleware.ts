/**
 * Which tools go out with each model request: the base tools, plus the
 * operations this chat has loaded. Every operation is registered with the
 * agent so it can run; this decides which ones the model is shown.
 */

import { createMiddleware, type BaseMessage } from "langchain";
import { toolName } from "./operations.js";
import { LOAD_OPERATION } from "./tools.js";

type ToolCall = { id?: string; name: string; args: Record<string, unknown> };

/**
 * Tool names of the operations loaded so far. Read from the chat's own
 * messages, so a chat that is reopened has the same operations in reach.
 */
export function loadedOperations(messages: BaseMessage[]): Set<string> {
  const succeeded = new Set(
    messages.flatMap((m) => {
      const id = (m as { tool_call_id?: string }).tool_call_id;
      return id && !String(m.content).startsWith("Error:") ? [id] : [];
    }),
  );
  return new Set(
    messages
      .flatMap((m) => (m as { tool_calls?: ToolCall[] }).tool_calls ?? [])
      .filter((call) => call.name === LOAD_OPERATION && succeeded.has(call.id!))
      .map((call) =>
        toolName(String(call.args.package), String(call.args.operation)),
      ),
  );
}

/** The base tools and the loaded operations, out of everything registered. */
export function toolsInReach<T>(
  registered: T[],
  base: string[],
  loaded: Set<string>,
): T[] {
  return registered.filter((t) => {
    const name = (t as { name?: unknown }).name;
    // A tool without a name is a provider's own; it is not ours to hold back.
    return typeof name !== "string" || base.includes(name) || loaded.has(name);
  });
}

export const operationsInReach = (base: string[]) =>
  createMiddleware({
    name: "OperationsInReach",
    wrapModelCall: (request, handler) =>
      handler({
        ...request,
        tools: toolsInReach(
          request.tools,
          base,
          loadedOperations(request.messages),
        ),
      }),
  });
