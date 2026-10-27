/**
 * que, from outside: one run of one message, as a user makes it, and what the
 * agent did. The one file that knows the LangGraph server and its SDK. What
 * it hands back is in the runner's own form.
 */

import { Client } from "@langchain/langgraph-sdk";

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

// The graph que serves (server/runtime/langgraph.json).
const GRAPH = "agent";
// On the trace que sends of each run: it tells a run of the runner from a chat.
const TAG = "eval";
const FROM = { human: "user", ai: "agent", tool: "tool" } as const;

type Raw = {
  type?: string;
  content?: unknown;
  name?: string | null;
  tool_calls?: Call[];
};

/** The text of a message's content: the content itself, or its text parts, joined. */
export function text(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part: unknown) => {
      if (typeof part === "string") return part;
      const { type, text } = (part ?? {}) as { type?: string; text?: unknown };
      return type === "text" && typeof text === "string" ? text : "";
    })
    .join("");
}

function own(raw: Raw): Message[] {
  const from = FROM[raw.type as keyof typeof FROM];
  if (!from) return [];
  return [
    {
      from,
      text: text(raw.content),
      calls: (raw.tool_calls ?? []).map(({ name, args }) => ({ name, args })),
      ...(from === "tool" ? { tool: raw.name ?? "" } : {}),
    },
  ];
}

// que sends the fault of a run as JSON, and the SDK puts the kind of error in
// front of it: `Error: {"error":"Error","message":"..."}`.
function fault(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const json = message.indexOf("{");
  try {
    const inner = (JSON.parse(message.slice(json)) as { message?: unknown })
      .message;
    return typeof inner === "string" ? inner : message;
  } catch {
    return message;
  }
}

export function que(url: string): Que {
  const client = new Client({ apiUrl: url });
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
      const { thread_id: thread } = await client.threads.create();
      try {
        // que answers the wait with the values of the thread: its messages.
        const values = (await client.runs.wait(thread, GRAPH, {
          input: { messages: [{ role: "user", content: input }] },
          config: {
            tags: [TAG],
            ...(agent === undefined ? {} : { configurable: { agent } }),
          },
        })) as { messages?: Raw[] };
        return (values.messages ?? []).flatMap(own);
      } catch (error) {
        throw new Error(fault(error), { cause: error });
      } finally {
        // A run of the runner is not one of the user's chats.
        await client.threads.delete(thread).catch(() => undefined);
      }
    },
  };
}
