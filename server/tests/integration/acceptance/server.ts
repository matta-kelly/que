/**
 * The acceptance test's control of its child servers: one process of que's
 * server (serve.child.ts), started on a port of its own, signed in as one
 * user, on a database and a data directory the test gives it; stopped by a
 * signal; and asked to run a thread with a scripted model.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, type AddressInfo } from "node:net";
import { join } from "node:path";
import type { Message } from "@earendil-works/pi-ai";

const server = join(import.meta.dirname, "..", "..", "..");

/** One scripted model response: a tool call, or the run's answer. */
export type Step =
  | { tool: { name: string; arguments: Record<string, unknown>; id: string } }
  | { text: string };

export const sleep = (ms: number) =>
  new Promise((later) => setTimeout(later, ms));

/** A port nothing holds, asked for just before a server binds it. */
export async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((ready) => probe.listen(0, "127.0.0.1", ready));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((closed) => probe.close(() => closed()));
  return port;
}

export type Running = {
  base: string;
  proc: ChildProcess;
  exited: Promise<void>;
};

/**
 * A child server listening until it is killed, signed in as `email`, on
 * `env`'s DATABASE_URL, QUE_DATA_DIR and deployment. Waited for until /ok
 * answers, with a bound.
 */
export async function start(
  env: NodeJS.ProcessEnv,
  email: string,
  children: Set<ChildProcess>,
): Promise<Running> {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const proc = spawn(
    process.execPath,
    ["--import", "tsx", "tests/integration/acceptance/serve.child.ts"],
    {
      cwd: server,
      env: { ...env, DEV_USER_EMAIL: email, PORT: String(port) },
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  children.add(proc);
  let out = "";
  proc.stdout?.on("data", (chunk: Buffer) => (out += chunk.toString()));
  let ended = false;
  const exited = new Promise<void>((done) =>
    proc.once("exit", () => {
      ended = true;
      children.delete(proc);
      done();
    }),
  );
  for (let tries = 0; tries < 300; tries++) {
    if (ended) throw new Error(`the server ended before it listened:\n${out}`);
    try {
      if ((await fetch(`${base}/ok`)).ok) return { base, proc, exited };
    } catch {
      // Not listening yet.
    }
    await sleep(100);
  }
  proc.kill("SIGKILL");
  throw new Error(`the server did not listen:\n${out}`);
}

/** Stops a child server and waits for its process to end. */
export async function stop({ proc, exited }: Running): Promise<void> {
  proc.kill("SIGKILL");
  await exited;
  // A killed server's socket closes a moment later.
  await sleep(300);
}

/** Starts a server on a port that another start may have just given up. */
export async function startAgain(
  env: NodeJS.ProcessEnv,
  email: string,
  children: Set<ChildProcess>,
): Promise<Running> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await start(env, email, children);
    } catch (error) {
      if (attempt >= 10) throw error;
      await sleep(300);
    }
  }
}

/** Sets the server's next model responses, and clears its recorded requests. */
export async function scripted(
  { base }: Running,
  steps: Step[],
): Promise<void> {
  const set = await fetch(`${base}/__faux`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ steps }),
  });
  if (!set.ok) throw new Error(`the script was not set: ${await set.text()}`);
}

/** Each model request's messages, as the run made them. */
export async function requestsOf({ base }: Running): Promise<Message[][]> {
  const got = await fetch(`${base}/__requests`);
  if (!got.ok)
    throw new Error(`the requests were not read: ${await got.text()}`);
  return (await got.json()) as Message[][];
}

/** Makes a thread of the signed-in user, with the deployment's agent. */
export async function makeThread({ base }: Running): Promise<string> {
  const made = await fetch(`${base}/threads`, { method: "POST" });
  if (made.status !== 201)
    throw new Error(`the thread was not made: ${await made.text()}`);
  return ((await made.json()) as { id: string }).id;
}

/** Uploads `bytes` as `name` to the thread, as the composer does: a multipart body whose part is "file". */
export async function upload(
  { base }: Running,
  thread: string,
  name: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<{ id: string; name: string; mimeType: string; size: number }> {
  const form = new FormData();
  form.set("file", new File([bytes as BlobPart], name, { type: mimeType }));
  const made = await fetch(`${base}/threads/${thread}/files`, {
    method: "POST",
    body: form,
  });
  if (made.status !== 201)
    throw new Error(`the file was not uploaded: ${await made.text()}`);
  return (await made.json()) as {
    id: string;
    name: string;
    mimeType: string;
    size: number;
  };
}

/** One message on the thread, run until its stream ends; the stream's text. */
export async function runOn(
  { base }: Running,
  thread: string,
  content: string,
): Promise<string> {
  const answer = await fetch(`${base}/threads/${thread}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      threadId: thread,
      runId: randomUUID(),
      messages: [{ id: randomUUID(), role: "user", content }],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!answer.ok)
    throw new Error(`the run was not started: ${await answer.text()}`);
  return answer.text();
}
