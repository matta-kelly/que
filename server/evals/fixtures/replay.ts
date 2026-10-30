/**
 * A local server that answers as que's server does. Its answers are in `que/`:
 * taken from que's server on pi, with pi-ai's scripted model (`faux`) and the
 * fixture deployment "tools" (server/tests/integration/mount/fixtures), for a
 * thread made with an agent picked, a run that finished and a run que did
 * not finish, with the names of that deployment changed to the fixtures' own.
 * The thread made holds the agent its POST picked, as que's does. A run's
 * events are kept as a list, and sent as que sends them: AG-UI events over SSE.
 */

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

const captured = (name: string) =>
  readFileSync(join(import.meta.dirname, "que", name), "utf8");

/** The thread que made, as `que/thread.json` holds it. */
export const THREAD = (JSON.parse(captured("thread.json")) as { id: string })
  .id;

export type Sent = { method: string; path: string; body: unknown };
/** What a thread's POST picks: the agent config its runs take, or none (null). */
export type Pick = { agent: string | null };
/** What the replay reads of a run's AG-UI RunAgentInput. */
type RunInput = { runId?: string };
type Event = { type: string; threadId?: string; runId?: string };

/** A run's events, as que streams them: the run they frame is the URL's thread and the input's run. */
const stream = (name: string, input: RunInput) =>
  (JSON.parse(captured(name)) as Event[])
    .map((event) =>
      "runId" in event
        ? { ...event, threadId: THREAD, runId: input.runId }
        : event,
    )
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");

/**
 * `fails` says, from the pick of the run's thread, which runs que does not
 * finish. With none given, each run finishes. A run is on the thread made last.
 */
export async function replay(fails: (pick: Pick) => boolean = () => false) {
  const sent: Sent[] = [];
  let pick: Pick = { agent: null };
  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      const body: unknown = raw ? JSON.parse(raw) : undefined;
      const method = request.method ?? "";
      const path = request.url ?? "";
      sent.push({ method, path, body });
      const send = (
        status: number,
        text: string,
        type = "application/json",
      ) => {
        response.writeHead(status, { "content-type": type });
        response.end(text);
      };
      if (method === "GET" && path === "/ok") send(200, '{"ok":true}');
      else if (method === "POST" && path === "/threads") {
        pick = { agent: (body as Partial<Pick> | undefined)?.agent ?? null };
        send(
          201,
          JSON.stringify({ ...JSON.parse(captured("thread.json")), ...pick }),
        );
      } else if (method === "POST" && path === `/threads/${THREAD}/runs`) {
        const input = body as RunInput;
        send(
          200,
          stream(fails(pick) ? "wait-error.json" : "wait.json", input),
          "text/event-stream",
        );
      } else if (method === "DELETE" && path === `/threads/${THREAD}`)
        send(204, "");
      else send(404, '{"error":"not found"}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    sent,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
