/**
 * A yes for an op, through que's server listening on a port of its own: a run whose model calls an op that needs a yes
 * ends its stream on an AG-UI interrupt on that tool call, the thread says it waits on it, and a POST whose `resume`
 * answers it runs the op, or refuses it, and streams the rest of the run. A stop ends the wait.
 *
 * On a database of its own (PGlite, served on a local port) and the fixture deployment "tools", whose one agent uses
 * the plugin "till": `till-void` needs a yes. In the place of Fireworks, pi-ai's scripted provider (`faux`) answers
 * under Fireworks' provider id, so no model is called.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { deploymentRoot } from "../../../tests/deployment-root.js";
import { grant } from "../../../tests/integration/grants.js";

const db = await PGlite.create();
const database = new PGLiteSocketServer({ db, port: 0, maxConnections: 100 });
await database.start();
process.env.DATABASE_URL = `postgresql://postgres@${database.getServerConn()}/postgres`;
process.env.QUE_CREDENTIALS_KEY = randomBytes(32).toString("base64");
process.env.QUE_DEPLOYMENT = deploymentRoot(
  join(import.meta.dirname, "../../../tests/integration/mount/fixtures"),
  "tools",
);
delete process.env.DEV_USER_EMAIL;
delete process.env.DEV_USER_NAME;
const { app } = await import("../serve.js");
const { models } = await import("../runner/pi/harness.js");

const faux = fauxProvider({
  provider: "fireworks",
  models: [{ id: "small-model", contextWindow: 64_000 }],
});
models.setProvider(faux.provider);

const server = serve({ fetch: app.fetch, port: 0 });
await new Promise((ready) => server.once("listening", ready));
const base = `http://localhost:${(server.address() as AddressInfo).port}`;

after(async () => {
  await new Promise((closed) => server.close(closed));
  await database.stop();
  await db.close();
});

type Event = { type: string; [field: string]: unknown };
type Message = {
  id: string;
  role: string;
  content?: unknown;
  toolCalls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  toolCallId?: string;
};

/** Signs in as `email`, as @que/identity reads it, and saves their till key. */
async function signIn(email: string, key: string) {
  process.env.DEV_USER_EMAIL = email;
  // The user reaches the deployment's connectors: the till, through its test domain, before their connection.
  await grant(email, email.split("@")[0], "till-domain");
  const saved = await fetch(`${base}/que/connections/till`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values: { key } }),
  });
  assert.equal(saved.status, 200, await saved.clone().text());
}

/** A thread of the signed-in user's, made through POST /threads. */
const thread = async () =>
  (
    (await (await fetch(`${base}/threads`, { method: "POST" })).json()) as {
      id: string;
    }
  ).id;

const user = (content: string): Message => ({
  id: randomUUID(),
  role: "user",
  content,
});

/**
 * The AG-UI events of an SSE body, each `data:` line one event, read to the end of the stream. At the first event
 * `until` holds for, `then` is called and awaited. A stream that has not ended `limit` ms after that ends the read: its
 * events so far, with `ended` false.
 */
async function eventsOf(
  response: Response,
  at?: { until: (event: Event) => boolean; then: () => Promise<void> },
  limit = 15_000,
): Promise<{ events: Event[]; ended: boolean }> {
  const events: Event[] = [];
  if (!response.body) return { events, ended: true };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  let reached = false;
  let deadline: number | undefined;
  for (;;) {
    const left = deadline === undefined ? 60_000 : deadline - Date.now();
    const read = await Promise.race([
      reader.read(),
      new Promise<"late">((late) =>
        setTimeout(() => late("late"), Math.max(left, 0)),
      ),
    ]);
    if (read === "late") {
      await reader.cancel();
      return { events, ended: false };
    }
    if (read.done) return { events, ended: true };
    rest += decoder.decode(read.value, { stream: true });
    const frames = rest.split("\n\n");
    rest = frames.pop() ?? "";
    for (const frame of frames) {
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!data) continue;
      const event = JSON.parse(data) as Event;
      events.push(event);
      if (!reached && at?.until(event)) {
        reached = true;
        await at.then();
        deadline = Date.now() + limit;
      }
    }
  }
}

const sent = (
  threadId: string,
  messages: Message[],
  resume?: { interruptId: string; status: string; payload?: unknown }[],
) =>
  fetch(`${base}/threads/${threadId}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      threadId,
      runId: randomUUID(),
      messages,
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
      ...(resume ? { resume } : {}),
    }),
  });

type Interrupt = {
  id: string;
  reason: string;
  toolCallId?: string;
  message?: string;
  metadata?: unknown;
};

/** The thread as GET /threads/:id gives it. */
const record = async (threadId: string) =>
  (await (await fetch(`${base}/threads/${threadId}`)).json()) as {
    running: boolean;
    interrupts: Interrupt[];
    messages: Message[];
  };

/** The interrupts a stream ended on: its RUN_FINISHED's interrupt outcome. */
const interruptsOf = (events: Event[]) => {
  const outcome = events.at(-1)?.outcome as
    { type: string; interrupts?: Interrupt[] } | undefined;
  return outcome?.type === "interrupt" ? (outcome.interrupts ?? []) : [];
};

/** Waits until the thread's run has ended, or `limit` ms have gone. */
async function idle(threadId: string, limit = 10_000) {
  const until = Date.now() + limit;
  while ((await record(threadId)).running && Date.now() < until)
    await new Promise((later) => setTimeout(later, 50));
  return !(await record(threadId)).running;
}

/**
 * A run on a new thread in which the model calls till-void for `item`, then answers `then`: the stream the first POST
 * gives, which ends on the yes the op asks for. Its thread, the call's id, and the messages the client then holds.
 */
async function asked(item: string, then: string) {
  const id = await thread();
  const call = `void-${item}`;
  const u1 = user(`Void the ${item}.`);
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxText("Voiding. "),
        fauxToolCall("till-void", { item }, { id: call }),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(fauxText(then)),
  ]);
  const { events, ended } = await eventsOf(await sent(id, [u1]));
  const start = events.find((e) => e.type === "TOOL_CALL_START");
  const a1: Message = {
    id: String(start?.parentMessageId),
    role: "assistant",
    content: "Voiding. ",
    toolCalls: [
      {
        id: call,
        type: "function",
        function: { name: "till-void", arguments: JSON.stringify({ item }) },
      },
    ],
  };
  return { id, call, chat: [u1, a1], events, ended };
}

const resultOf = (events: Event[], call: string) =>
  events.find((e) => e.type === "TOOL_CALL_RESULT" && e.toolCallId === call);

const said = (events: Event[], text: string) =>
  events.some(
    (e) => e.type === "TEXT_MESSAGE_CONTENT" && String(e.delta).includes(text),
  );

test("given a run whose model calls an op that needs a yes, when the op is called, then the stream ends on a tool_call interrupt on that call with the op and its input, the op has not run, and GET /threads/:id says the run goes and waits on it", async () => {
  await signIn("ana@example.com", "ana-key");
  const run = await asked("scarf", "Voided.");
  const [interrupt] = interruptsOf(run.events);
  const held = await record(run.id);
  assert.deepEqual(
    {
      ended: run.ended,
      last: run.events.at(-1)?.type,
      count: interruptsOf(run.events).length,
      reason: interrupt?.reason,
      toolCallId: interrupt?.toolCallId,
      metadata: interrupt?.metadata,
      ran: resultOf(run.events, run.call) !== undefined,
      running: held.running,
      waits: held.interrupts,
    },
    {
      ended: true,
      last: "RUN_FINISHED",
      count: 1,
      reason: "tool_call",
      toolCallId: run.call,
      metadata: { plugin: "till", op: "till-void", input: { item: "scarf" } },
      ran: false,
      running: true,
      waits: [interrupt],
    },
  );
  // The run is not left waiting for the next test.
  await sent(run.id, run.chat, [
    { interruptId: interrupt!.id, status: "cancelled" },
  ]).then((r) => r.body?.cancel());
  assert.equal(await idle(run.id), true);
});

test("given a run that waits on a yes, when the client resumes it with approved: true, then the resume's stream runs the op on the user's connection, gives its result and the model's answer, and ends the run with nothing left to wait on", async () => {
  await signIn("ana@example.com", "ana-key");
  const run = await asked("hat", "Voided.");
  const [interrupt] = interruptsOf(run.events);
  const resumed = await eventsOf(
    await sent(run.id, run.chat, [
      {
        interruptId: interrupt!.id,
        status: "resolved",
        payload: { approved: true },
      },
    ]),
  );
  const result = resultOf(resumed.events, run.call);
  assert.equal(await idle(run.id), true);
  const held = await record(run.id);
  assert.deepEqual(
    {
      first: resumed.events[0]?.type,
      last: resumed.events.at(-1)?.type,
      outcome: resumed.events.at(-1)?.outcome,
      result: JSON.parse(String(result?.content)),
      answered: said(resumed.events, "Voided."),
      waits: held.interrupts,
      roles: held.messages.map((m) => m.role),
    },
    {
      first: "RUN_STARTED",
      last: "RUN_FINISHED",
      outcome: undefined,
      result: { conn: "till:ana-key", item: "hat", voided: true },
      answered: true,
      waits: [],
      roles: ["user", "assistant", "tool", "assistant"],
    },
  );
});

test("given a run that waits on a yes, when the client resumes it with approved: false, then the op does not run, the model gets a failed call that says the user declined, and the run goes on to its answer", async () => {
  await signIn("ana@example.com", "ana-key");
  const run = await asked("belt", "Left as it is.");
  const [interrupt] = interruptsOf(run.events);
  const resumed = await eventsOf(
    await sent(run.id, run.chat, [
      {
        interruptId: interrupt!.id,
        status: "resolved",
        payload: { approved: false },
      },
    ]),
  );
  const result = String(resultOf(resumed.events, run.call)?.content);
  assert.deepEqual(
    {
      declined: result.includes("the user declined: the call did not run"),
      voided: result.includes("voided"),
      answered: said(resumed.events, "Left as it is."),
      last: resumed.events.at(-1)?.type,
    },
    { declined: true, voided: false, answered: true, last: "RUN_FINISHED" },
  );
  assert.equal(await idle(run.id), true);
});

test("given a run that waits on a yes, when a resume answers another interrupt, or none waits, then the route refuses it and the run still waits", async () => {
  await signIn("ana@example.com", "ana-key");
  const run = await asked("sock", "Voided.");
  const [interrupt] = interruptsOf(run.events);
  const wrong = await sent(run.id, run.chat, [
    { interruptId: "not-one", status: "resolved", payload: { approved: true } },
  ]);
  const twice = await sent(run.id, run.chat, [
    { interruptId: interrupt!.id, status: "cancelled" },
    { interruptId: interrupt!.id, status: "cancelled" },
  ]);
  const still = (await record(run.id)).interrupts;
  await sent(run.id, run.chat, [
    { interruptId: interrupt!.id, status: "cancelled" },
  ]).then((r) => r.body?.cancel());
  assert.equal(await idle(run.id), true);
  const none = await sent(run.id, run.chat, [
    { interruptId: interrupt!.id, status: "cancelled" },
  ]);
  assert.deepEqual(
    {
      wrong: wrong.status,
      twice: twice.status,
      still,
      none: none.status,
    },
    { wrong: 400, twice: 400, still: [interrupt], none: 409 },
  );
});

test("given a run that waits on a yes, when the client joins it, then the join gives the stream that ended on the interrupt", async () => {
  await signIn("ana@example.com", "ana-key");
  const run = await asked("cap", "Voided.");
  const joined = await eventsOf(await fetch(`${base}/threads/${run.id}/join`));
  assert.deepEqual(interruptsOf(joined.events), interruptsOf(run.events));
  await sent(run.id, run.chat, [
    { interruptId: interruptsOf(run.events)[0]!.id, status: "cancelled" },
  ]).then((r) => r.body?.cancel());
  assert.equal(await idle(run.id), true);
});

test("given a run that waits on a yes, when the thread is stopped, then the op does not run, the run ends, and nothing is left to wait on", async () => {
  await signIn("ana@example.com", "ana-key");
  const run = await asked("glove", "Voided.");
  const watched = fetch(`${base}/threads/${run.id}/join`).then((r) =>
    eventsOf(r),
  );
  const stopped = await fetch(`${base}/threads/${run.id}/stop`, {
    method: "POST",
  });
  const joined = await watched;
  const ended = await idle(run.id);
  const held = await record(run.id);
  assert.deepEqual(
    {
      stopped: await stopped.json(),
      last: joined.events.at(-1)?.type,
      voided: String(resultOf(joined.events, run.call)?.content).includes(
        "voided",
      ),
      ended,
      waits: held.interrupts,
    },
    {
      stopped: { stopped: true },
      last: "RUN_FINISHED",
      voided: false,
      ended: true,
      waits: [],
    },
  );
});
