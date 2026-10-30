import { HttpAgent, type Message } from "@ag-ui/client";

// que's server, through the Next.js proxy at /api: the user's threads, and an
// AG-UI agent that runs one of them.

/** A thread of the signed-in user's, as que's server gives one: `stopped` says its last run was stopped. */
export type QueThread = { id: string; createdAt: string; stopped: boolean };

const thread = (id: string) => `/api/threads/${encodeURIComponent(id)}`;

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`que's server answered ${res.status}`);
  return (await res.json()) as T;
}

export const threads = {
  list: async () => json<QueThread[]>(await fetch("/api/threads")),
  make: async () =>
    json<QueThread>(await fetch("/api/threads", { method: "POST" })),
  /** A thread, with its messages as AG-UI messages, each with the id que's server gave it, and whether its run goes. */
  get: async (id: string) =>
    json<QueThread & { messages: Message[]; running: boolean }>(
      await fetch(thread(id)),
    ),
  /** Stops the thread's run on que's server: whether a run went, which it then marks stopped. */
  stop: async (id: string) =>
    json<{ stopped: boolean }>(
      await fetch(`${thread(id)}/stop`, { method: "POST" }),
    ),
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

/** The thread's run, joined on que's server: GET /threads/:id/join, read as AG-UI's client reads a run. */
class Join extends HttpAgent {
  constructor(id: string) {
    super({ url: `${thread(id)}/join` });
  }

  protected override requestInit(): RequestInit {
    return {
      method: "GET",
      headers: { ...this.headers, Accept: "text/event-stream" },
      signal: this.abortController.signal,
    };
  }
}

/**
 * Joins the thread's run on que's server, and gives the thread's messages as
 * AG-UI's client applies the run's events: the chat, the reply so far, then
 * the reply as it grows, until the run ends. `signal` leaves the run, which
 * goes on on que's server.
 */
export async function* join(
  id: string,
  signal: AbortSignal,
): AsyncGenerator<readonly Message[]> {
  const agent = new Join(id);
  signal.addEventListener("abort", () => agent.abortRun(), { once: true });
  let latest: readonly Message[] | undefined;
  let ended = false;
  let failed: unknown;
  let wake = () => {};
  void agent
    .runAgent(
      {},
      {
        onMessagesChanged: ({ messages }) => {
          latest = messages;
          wake();
        },
      },
    )
    .catch((error: unknown) => (failed = error))
    .finally(() => {
      ended = true;
      wake();
    });
  for (;;) {
    if (latest) {
      const messages = latest;
      latest = undefined;
      yield messages;
    } else if (ended) break;
    else await new Promise<void>((woken) => (wake = woken));
  }
  if (failed && !signal.aborted) throw failed;
}
