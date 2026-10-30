/**
 * que, from outside: one run of one message, as a user makes it, and what the
 * agent did. The one file that knows que's server and its AG-UI client. What
 * it hands back is in the runner's own form.
 */

import { randomUUID } from "node:crypto";
import { contentToText, HttpAgent, type Message as Agui } from "@ag-ui/client";

export type Call = { name: string; args: unknown };
/** One message of a thread. `tool` is on a tool's message only: the tool that answered. */
export type Message = {
  from: "user" | "agent" | "tool";
  text: string;
  calls: Call[];
  tool?: string;
};
export type Que = {
  up(): Promise<boolean>;
  /** Run one message on a new thread, under the agent config named, or under none. */
  run(input: string, agent?: string): Promise<Message[]>;
};

// On the trace que sends of each run: it tells a run of the runner from a chat.
const TAG = "eval";

const parsed = (json: string): unknown => {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
};

/** The run's messages in the runner's form: a tool's message is named by the call it answers. */
function own(messages: Agui[]): Message[] {
  const tools = new Map<string, string>();
  return messages.flatMap((message): Message[] => {
    if (message.role === "user")
      return [
        { from: "user", text: contentToText(message.content), calls: [] },
      ];
    if (message.role === "tool")
      return [
        {
          from: "tool",
          tool: tools.get(message.toolCallId) ?? "",
          text: contentToText(message.content),
          calls: [],
        },
      ];
    if (message.role !== "assistant") return [];
    const calls = (message.toolCalls ?? []).map(({ id, function: call }) => {
      tools.set(id, call.name);
      return { name: call.name, args: parsed(call.arguments) };
    });
    return [{ from: "agent", text: message.content ?? "", calls }];
  });
}

export function que(url: string): Que {
  const threads = `${url}/threads`;
  return {
    async up() {
      try {
        return (await fetch(`${url}/ok`, { signal: AbortSignal.timeout(3000) }))
          .ok;
      } catch {
        return false;
      }
    },
    async run(input, agent) {
      // The thread picks the agent config its runs take.
      const made = await fetch(threads, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(agent === undefined ? {} : { agent }),
      });
      if (!made.ok)
        throw new Error(`HTTP ${made.status}: ${await made.text()}`);
      const { id: thread } = (await made.json()) as { id: string };
      const at = `${threads}/${encodeURIComponent(thread)}`;
      try {
        const client = new HttpAgent({
          url: `${at}/runs`,
          threadId: thread,
          initialMessages: [{ id: randomUUID(), role: "user", content: input }],
        });
        let failed: string | undefined;
        await client.runAgent(
          { forwardedProps: { tags: [TAG] } },
          { onRunErrorEvent: ({ event }) => void (failed = event.message) },
        );
        if (failed !== undefined) throw new Error(failed);
        return own(client.messages);
      } finally {
        // A run of the runner is not one of the user's chats.
        await fetch(at, { method: "DELETE" }).catch(() => undefined);
      }
    },
  };
}
