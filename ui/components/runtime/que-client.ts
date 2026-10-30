import { HttpAgent, type Message } from "@ag-ui/client";

// que's server, through the Next.js proxy at /api: the user's threads, and an
// AG-UI agent that runs one of them.

/** A thread of the signed-in user's, as que's server gives one. */
export type QueThread = { id: string; createdAt: string };

const thread = (id: string) => `/api/threads/${encodeURIComponent(id)}`;

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`que's server answered ${res.status}`);
  return (await res.json()) as T;
}

export const threads = {
  list: async () => json<QueThread[]>(await fetch("/api/threads")),
  make: async () =>
    json<QueThread>(await fetch("/api/threads", { method: "POST" })),
  /** A thread, with its messages as AG-UI messages, each with the id que's server gave it. */
  get: async (id: string) =>
    json<QueThread & { messages: Message[] }>(await fetch(thread(id))),
};

/**
 * An agent for one thread: a run is POST /threads/:id/runs, on the thread
 * `threadOf` gives when the run starts. A new chat has no thread on the server
 * until its first message is sent.
 */
export class ThreadAgent extends HttpAgent {
  constructor(private readonly threadOf: () => Promise<string>) {
    super({ url: "/api/threads" });
  }

  override async runAgent(...args: Parameters<HttpAgent["runAgent"]>) {
    this.url = `${thread(await this.threadOf())}/runs`;
    return super.runAgent(...args);
  }
}
