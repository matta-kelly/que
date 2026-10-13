/**
 * A local server that answers as que does. Its answers are in `que/`: taken
 * from a live que, for a run that finished and a run que did not finish, with
 * the names of that deployment changed to the fixtures' own.
 */

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

const captured = (name: string) =>
  readFileSync(join(import.meta.dirname, "que", name), "utf8");

export const THREAD = "00000000-0000-7000-8000-000000000001";

export type Sent = { method: string; path: string; body: unknown };
type RunBody = { config?: { configurable?: { agent?: string } } };

/** `fails` says which runs que does not finish. With none given, each run finishes. */
export async function replay(fails: (body: RunBody) => boolean = () => false) {
  const sent: Sent[] = [];
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
        response.writeHead(status, {
          "content-type": type,
          "content-location": `/threads/${THREAD}/runs/run-1`,
        });
        response.end(text);
      };
      if (method === "GET" && path === "/ok") send(200, '{"ok":true}');
      else if (method === "POST" && path === "/threads")
        send(200, captured("thread.json"));
      else if (method === "POST" && path === `/threads/${THREAD}/runs/wait`)
        send(
          200,
          captured(fails(body as RunBody) ? "wait-error.json" : "wait.json"),
          "text/plain; charset=UTF-8",
        );
      else if (method === "DELETE" && path === `/threads/${THREAD}`)
        send(204, "");
      else send(404, '{"detail":"Not Found"}');
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
