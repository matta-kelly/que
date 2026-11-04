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
  responseSchema?: {
    oneOf?: { required?: string[]; properties?: Record<string, unknown> }[];
  };
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

/**
 * A run on a new thread in which the model calls `till-note` for `item`, then answers `then`: the stream the first POST
 * gives, which ends on the yes the op asks. Its thread, the call's id, and the messages the client then holds.
 */
async function noted(item: string, then: string) {
  const id = await thread();
  const call = `note-${item}`;
  const u1 = user(`Note the ${item}.`);
  faux.setResponses([
    fauxAssistantMessage(
      [fauxText("Noting. "), fauxToolCall("till-note", { item }, { id: call })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(fauxText(then)),
  ]);
  const { events, ended } = await eventsOf(await sent(id, [u1]));
  const start = events.find((e) => e.type === "TOOL_CALL_START");
  const a1: Message = {
    id: String(start?.parentMessageId),
    role: "assistant",
    content: "Noting. ",
    toolCalls: [
      {
        id: call,
        type: "function",
        function: { name: "till-note", arguments: JSON.stringify({ item }) },
      },
    ],
  };
  return { id, call, chat: [u1, a1], events, ended };
}

/**
 * A run on a new thread in which the model calls each of `calls` in one turn, then answers `then`: the stream the first
 * POST gives, which ends on the yes the flagged calls ask, and the chat the client holds after it.
 */
async function called(
  calls: { call: string; op: string; args: Record<string, string> }[],
  then: string,
) {
  const id = await thread();
  const u1 = user("Do the till's work.");
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxText("Working. "),
        ...calls.map(({ call, op, args }) =>
          fauxToolCall(op, args, { id: call }),
        ),
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
    content: "Working. ",
    toolCalls: calls.map(({ call, op, args }) => ({
      id: call,
      type: "function",
      function: { name: op, arguments: JSON.stringify(args) },
    })),
  };
  return { id, chat: [u1, a1], events, ended };
}

/** A round's interrupts, in call-id order: the order a parallel round asks them in does not decide a test. */
const byCall = (interrupts: Interrupt[]) =>
  [...interrupts].sort((a, b) =>
    String(a.toolCallId).localeCompare(String(b.toolCallId)),
  );

/** The interrupt that asks for `item`, as its metadata's input names it. */
const asksFor = (interrupts: Interrupt[], item: string) =>
  interrupts.find(
    (interrupt) =>
      (interrupt.metadata as { input?: { item?: string } } | undefined)?.input
        ?.item === item,
  );

const resultOf = (events: Event[], call: string) =>
  events.find((e) => e.type === "TOOL_CALL_RESULT" && e.toolCallId === call);

/** A call's result as a value when it is JSON, and as its text when it is not: a failed call is text. */
const jsonOf = (events: Event[], call: string) => {
  const content = String(resultOf(events, call)?.content);
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return content;
  }
};

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
      metadata: {
        plugin: "till",
        op: "till-void",
        input: { item: "scarf" },
        decisions: ["approve", "edit", "reject"],
      },
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

test("given a run that waits on a yes, when the client resumes it with {type: approve}, then the resume's stream runs the op on the user's connection, gives its result and the model's answer, and ends the run with nothing left to wait on", async () => {
  await signIn("ana@example.com", "ana-key");
  const run = await asked("hat", "Voided.");
  const [interrupt] = interruptsOf(run.events);
  const resumed = await eventsOf(
    await sent(run.id, run.chat, [
      {
        interruptId: interrupt!.id,
        status: "resolved",
        payload: { type: "approve" },
      },
    ]),
  );
  assert.equal(await idle(run.id), true);
  const held = await record(run.id);
  assert.deepEqual(
    {
      first: resumed.events[0]?.type,
      last: resumed.events.at(-1)?.type,
      outcome: resumed.events.at(-1)?.outcome,
      result: jsonOf(resumed.events, run.call),
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

test("given a run that waits on a yes, when the client resumes it with {type: reject, message}, then the op does not run, the model gets a failed call that holds the message, and the run goes on to its answer", async () => {
  await signIn("ana@example.com", "ana-key");
  const run = await asked("belt", "Left as it is.");
  const [interrupt] = interruptsOf(run.events);
  const resumed = await eventsOf(
    await sent(run.id, run.chat, [
      {
        interruptId: interrupt!.id,
        status: "resolved",
        payload: { type: "reject", message: "The belt is fine." },
      },
    ]),
  );
  const result = String(resultOf(resumed.events, run.call)?.content);
  assert.deepEqual(
    {
      declined: result.includes("the user declined: the call did not run"),
      message: result.includes("The belt is fine."),
      voided: result.includes("voided"),
      answered: said(resumed.events, "Left as it is."),
      last: resumed.events.at(-1)?.type,
    },
    {
      declined: true,
      message: true,
      voided: false,
      answered: true,
      last: "RUN_FINISHED",
    },
  );
  assert.equal(await idle(run.id), true);
});

test("given a run that waits on a yes, when a resume answers another interrupt, or none waits, then the route refuses it and the run still waits", async () => {
  await signIn("ana@example.com", "ana-key");
  const run = await asked("sock", "Voided.");
  const [interrupt] = interruptsOf(run.events);
  const wrong = await sent(run.id, run.chat, [
    {
      interruptId: "not-one",
      status: "resolved",
      payload: { type: "approve" },
    },
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

test("given a model turn with two flagged calls, when the run reaches them, then the stream ends on one RUN_FINISHED with a tool_call interrupt on each call and neither op has run", async () => {
  await signIn("ana@example.com", "ana-key");
  const run = await called(
    [
      { call: "void-scarf", op: "till-void", args: { item: "scarf" } },
      { call: "void-hat", op: "till-void", args: { item: "hat" } },
    ],
    "Voided.",
  );
  const pause = byCall(interruptsOf(run.events));
  const held = await record(run.id);
  const ran = [
    resultOf(run.events, "void-scarf"),
    resultOf(run.events, "void-hat"),
  ].filter((result) => result !== undefined).length;
  assert.deepEqual(
    {
      ended: run.ended,
      last: run.events.at(-1)?.type,
      outcome: (run.events.at(-1)?.outcome as { type?: string } | undefined)
        ?.type,
      // One pause, not a pause on the first call and a queued second.
      pauses: run.events.filter((e) => e.type === "RUN_FINISHED").length,
      calls: pause.map((interrupt) => [interrupt.reason, interrupt.toolCallId]),
      metadata: pause.map((interrupt) => interrupt.metadata),
      ran,
      running: held.running,
      waits: byCall(held.interrupts).map((interrupt) => interrupt.toolCallId),
    },
    {
      ended: true,
      last: "RUN_FINISHED",
      outcome: "interrupt",
      pauses: 1,
      calls: [
        ["tool_call", "void-hat"],
        ["tool_call", "void-scarf"],
      ],
      metadata: [
        {
          plugin: "till",
          op: "till-void",
          input: { item: "hat" },
          decisions: ["approve", "edit", "reject"],
        },
        {
          plugin: "till",
          op: "till-void",
          input: { item: "scarf" },
          decisions: ["approve", "edit", "reject"],
        },
      ],
      ran: 0,
      running: true,
      waits: ["void-hat", "void-scarf"],
    },
  );
  // The run is not left waiting for the next test.
  await sent(
    run.id,
    run.chat,
    pause.map((interrupt) => ({
      interruptId: interrupt.id,
      status: "cancelled",
    })),
  ).then((response) => response.body?.cancel());
  assert.equal(await idle(run.id), true);
});

test("given a pause on two flagged calls, when one resume answers both, then each runs or refuses by its answer, the model gets both results, and the run ends with nothing left to wait on", async () => {
  await signIn("ana@example.com", "ana-key");
  const run = await called(
    [
      { call: "void-scarf", op: "till-void", args: { item: "scarf" } },
      { call: "void-hat", op: "till-void", args: { item: "hat" } },
    ],
    "Done.",
  );
  const pause = interruptsOf(run.events);
  const hat = asksFor(pause, "hat");
  const scarf = asksFor(pause, "scarf");
  const resumed = await eventsOf(
    await sent(run.id, run.chat, [
      {
        interruptId: hat?.id ?? "",
        status: "resolved",
        payload: { type: "approve" },
      },
      {
        interruptId: scarf?.id ?? "",
        status: "resolved",
        payload: { type: "reject" },
      },
    ]),
  );
  const approved = String(resultOf(resumed.events, "void-hat")?.content);
  const refused = String(resultOf(resumed.events, "void-scarf")?.content);
  assert.deepEqual(
    {
      first: resumed.events[0]?.type,
      last: resumed.events.at(-1)?.type,
      outcome: resumed.events.at(-1)?.outcome,
      approved,
      refused: refused.includes("the user declined: the call did not run"),
      voided: refused.includes("voided"),
      answered: said(resumed.events, "Done."),
    },
    {
      first: "RUN_STARTED",
      last: "RUN_FINISHED",
      outcome: undefined,
      approved: JSON.stringify({
        conn: "till:ana-key",
        item: "hat",
        voided: true,
      }),
      refused: true,
      voided: false,
      answered: true,
    },
  );
  assert.equal(await idle(run.id), true);
  const held = await record(run.id);
  assert.deepEqual(
    {
      waits: held.interrupts,
      roles: held.messages.map((message) => message.role),
    },
    { waits: [], roles: ["user", "assistant", "tool", "tool", "assistant"] },
  );
});

test("given a pause on two flagged calls, when a resume answers only one, then the route refuses it with 400 and the run still waits on both", async () => {
  await signIn("ana@example.com", "ana-key");
  const run = await called(
    [
      { call: "void-scarf", op: "till-void", args: { item: "scarf" } },
      { call: "void-hat", op: "till-void", args: { item: "hat" } },
    ],
    "Voided.",
  );
  const pause = byCall(interruptsOf(run.events));
  const wrong = await sent(run.id, run.chat, [
    {
      interruptId: pause[0]!.id,
      status: "resolved",
      payload: { type: "approve" },
    },
  ]);
  // The route the behavior asks for ends no stream: only a code that took the answer gives one to cancel.
  if (wrong.status !== 400) await wrong.body?.cancel();
  const still = byCall((await record(run.id)).interrupts);
  assert.deepEqual(
    {
      status: wrong.status,
      waits: still.length,
      calls: still.map((interrupt) => interrupt.toolCallId),
    },
    { status: 400, waits: 2, calls: ["void-hat", "void-scarf"] },
  );
  await sent(
    run.id,
    run.chat,
    pause.map((interrupt) => ({
      interruptId: interrupt.id,
      status: "cancelled",
    })),
  ).then((response) => response.body?.cancel());
  assert.equal(await idle(run.id), true);
});

test("given a turn with one flagged call and one unflagged call, when the run reaches them, then the unflagged call runs, the pause comes after its result, and it holds the one interrupt", async () => {
  await signIn("ana@example.com", "ana-key");
  const run = await called(
    [
      { call: "wait-sock", op: "till-wait", args: { item: "sock" } },
      { call: "void-sock", op: "till-void", args: { item: "sock" } },
    ],
    "Done.",
  );
  const pause = interruptsOf(run.events);
  const result = resultOf(run.events, "wait-sock");
  const resultAt = run.events.findIndex(
    (e) => e.type === "TOOL_CALL_RESULT" && e.toolCallId === "wait-sock",
  );
  const pauseAt = run.events.findIndex((e) => e.type === "RUN_FINISHED");
  const held = await record(run.id);
  assert.deepEqual(
    {
      ended: run.ended,
      last: run.events.at(-1)?.type,
      ran: String(result?.content),
      beforeThePause: resultAt >= 0 && resultAt < pauseAt,
      pauses: run.events.filter((e) => e.type === "RUN_FINISHED").length,
      holds: pause.map((interrupt) => [interrupt.reason, interrupt.toolCallId]),
      flagged: resultOf(run.events, "void-sock") === undefined,
      running: held.running,
      waits: held.interrupts.map((interrupt) => interrupt.toolCallId),
    },
    {
      ended: true,
      last: "RUN_FINISHED",
      ran: JSON.stringify({ item: "sock", counted: 3 }),
      beforeThePause: true,
      pauses: 1,
      holds: [["tool_call", "void-sock"]],
      flagged: true,
      running: true,
      waits: ["void-sock"],
    },
  );
  await sent(run.id, run.chat, [
    { interruptId: pause[0]!.id, status: "cancelled" },
  ]).then((response) => response.body?.cancel());
  assert.equal(await idle(run.id), true);
});

test("given a pause on two flagged calls, when the thread is stopped, then neither op runs, the run ends, and nothing is left to wait on", async () => {
  await signIn("ana@example.com", "ana-key");
  const run = await called(
    [
      { call: "void-scarf", op: "till-void", args: { item: "scarf" } },
      { call: "void-hat", op: "till-void", args: { item: "hat" } },
    ],
    "Voided.",
  );
  const pause = byCall(interruptsOf(run.events));
  const watched = fetch(`${base}/threads/${run.id}/join`).then((r) =>
    eventsOf(r),
  );
  const stopped = await fetch(`${base}/threads/${run.id}/stop`, {
    method: "POST",
  });
  const joined = await watched;
  const ended = await idle(run.id);
  const held = await record(run.id);
  const voided = held.messages.some((message) =>
    JSON.stringify(message).includes('"voided":true'),
  );
  assert.deepEqual(
    {
      paused: pause.map((interrupt) => [
        interrupt.reason,
        interrupt.toolCallId,
      ]),
      stopped: await stopped.json(),
      last: joined.events.at(-1)?.type,
      voided,
      ended,
      waits: held.interrupts,
    },
    {
      paused: [
        ["tool_call", "void-hat"],
        ["tool_call", "void-scarf"],
      ],
      stopped: { stopped: true },
      last: "RUN_FINISHED",
      voided: false,
      ended: true,
      waits: [],
    },
  );
});

test("given a run's ask, when the pause goes out, then no interrupt is a confirmation and each one names the call it asks for", async () => {
  await signIn("ana@example.com", "ana-key");
  const run = await called(
    [
      { call: "void-scarf", op: "till-void", args: { item: "scarf" } },
      { call: "void-hat", op: "till-void", args: { item: "hat" } },
    ],
    "Voided.",
  );
  const pause = interruptsOf(run.events);
  const named = (item: string) => {
    const asking = asksFor(pause, item);
    return [asking?.reason, asking?.toolCallId];
  };
  assert.deepEqual(
    {
      scarf: named("scarf"),
      hat: named("hat"),
      unnamed: pause.filter(
        (interrupt) =>
          interrupt.reason !== "tool_call" || !interrupt.toolCallId,
      ).length,
    },
    {
      scarf: ["tool_call", "void-scarf"],
      hat: ["tool_call", "void-hat"],
      unnamed: 0,
    },
  );
  await sent(
    run.id,
    run.chat,
    pause.map((interrupt) => ({
      interruptId: interrupt.id,
      status: "cancelled",
    })),
  ).then((response) => response.body?.cancel());
  assert.equal(await idle(run.id), true);
});

type Branch = {
  required?: string[];
  properties?: {
    type?: { const?: string };
    edited_action?: unknown;
    message?: unknown;
  };
};

/** The decision each branch of a pause's schema matches, on its `type`. */
const branchTypes = (interrupt: Interrupt | undefined) =>
  (interrupt?.responseSchema?.oneOf ?? []).map(
    (branch) => (branch as Branch).properties?.type?.const,
  );

/** The branch of a pause's schema that matches `decision`, on its `type`. */
const branchFor = (interrupt: Interrupt | undefined, decision: string) =>
  (interrupt?.responseSchema?.oneOf ?? []).find(
    (branch) => (branch as Branch).properties?.type?.const === decision,
  ) as Branch | undefined;

test("given a pause, then each interrupt's responseSchema has one branch per allowed decision, on type, and its metadata lists the decisions", async () => {
  await signIn("ana@example.com", "ana-key");
  const voided = await asked("scarf", "Voided.");
  const notedRun = await noted("scarf", "Noted.");
  const [voidInterrupt] = interruptsOf(voided.events);
  const [noteInterrupt] = interruptsOf(notedRun.events);
  const edit = branchFor(voidInterrupt, "edit");
  const edited = edit?.properties?.edited_action as
    | { required?: string[]; properties?: Record<string, { const?: string }> }
    | undefined;
  const respond = branchFor(noteInterrupt, "respond");
  const message = respond?.properties?.message as { type?: string } | undefined;
  assert.deepEqual(
    {
      void: {
        branches: branchTypes(voidInterrupt),
        required: (voidInterrupt?.responseSchema?.oneOf ?? []).map((branch) =>
          (branch as Branch).required?.includes("type"),
        ),
        metadata: voidInterrupt?.metadata,
      },
      note: {
        branches: branchTypes(noteInterrupt),
        metadata: noteInterrupt?.metadata,
      },
      // The edit branch names the call it may change, and the respond branch holds its message.
      edit: {
        requiresTheAction: edit?.required?.includes("edited_action"),
        requiresANameAndArgs:
          edited?.required?.includes("name") &&
          edited?.required?.includes("args"),
        name: edited?.properties?.name?.const,
      },
      respond: {
        requiresTheMessage: respond?.required?.includes("message"),
        message: message?.type,
      },
    },
    {
      void: {
        branches: ["approve", "edit", "reject"],
        required: [true, true, true],
        metadata: {
          plugin: "till",
          op: "till-void",
          input: { item: "scarf" },
          decisions: ["approve", "edit", "reject"],
        },
      },
      note: {
        branches: ["approve", "reject", "respond"],
        metadata: {
          plugin: "till",
          op: "till-note",
          input: { item: "scarf" },
          decisions: ["approve", "reject", "respond"],
        },
      },
      edit: {
        requiresTheAction: true,
        requiresANameAndArgs: true,
        name: "till-void",
      },
      respond: { requiresTheMessage: true, message: "string" },
    },
  );
  for (const run of [voided, notedRun])
    await sent(
      run.id,
      run.chat,
      interruptsOf(run.events).map((interrupt) => ({
        interruptId: interrupt.id,
        status: "cancelled",
      })),
    ).then((response) => response.body?.cancel());
  assert.equal(await idle(voided.id), true);
  assert.equal(await idle(notedRun.id), true);
});

test("given a run that waits on a yes, when the client resumes it with an edit of the call, then the op runs with the edited args and the model gets that result", async () => {
  await signIn("ana@example.com", "ana-key");
  const run = await asked("scarf", "Edited.");
  const [interrupt] = interruptsOf(run.events);
  const resumed = await eventsOf(
    await sent(run.id, run.chat, [
      {
        interruptId: interrupt!.id,
        status: "resolved",
        payload: {
          type: "edit",
          edited_action: { name: "till-void", args: { item: "coat" } },
        },
      },
    ]),
  );
  assert.deepEqual(
    {
      first: resumed.events[0]?.type,
      last: resumed.events.at(-1)?.type,
      result: jsonOf(resumed.events, run.call),
      answered: said(resumed.events, "Edited."),
      waits: (await record(run.id)).interrupts,
    },
    {
      first: "RUN_STARTED",
      last: "RUN_FINISHED",
      result: { conn: "till:ana-key", item: "coat", voided: true },
      answered: true,
      waits: [],
    },
  );
  assert.equal(await idle(run.id), true);
});

test("given a run that waits on a yes, when the client resumes it with an edit whose name is not the call's, then it is a reject that says so and the op does not run", async () => {
  await signIn("ana@example.com", "ana-key");
  const run = await asked("scarf", "Left as it is.");
  const [interrupt] = interruptsOf(run.events);
  const resumed = await eventsOf(
    await sent(run.id, run.chat, [
      {
        interruptId: interrupt!.id,
        status: "resolved",
        payload: {
          type: "edit",
          edited_action: { name: "till-count", args: { item: "scarf" } },
        },
      },
    ]),
  );
  const result = String(resultOf(resumed.events, run.call)?.content);
  assert.deepEqual(
    {
      declined: result.includes("the user declined: the call did not run"),
      namesTheCall: result.includes("till-void"),
      namesTheEdit: result.includes("till-count"),
      voided: result.includes("voided"),
      answered: said(resumed.events, "Left as it is."),
    },
    {
      declined: true,
      namesTheCall: true,
      namesTheEdit: true,
      voided: false,
      answered: true,
    },
  );
  assert.equal(await idle(run.id), true);
});

test("given a run that waits on a yes whose op allows respond, when the client resumes it with respond, then the op does not run and the model's tool result is the message", async () => {
  await signIn("ana@example.com", "ana-key");
  const run = await noted("scarf", "Noted.");
  const [interrupt] = interruptsOf(run.events);
  const message = "The scarf is not for sale.";
  const resumed = await eventsOf(
    await sent(run.id, run.chat, [
      {
        interruptId: interrupt!.id,
        status: "resolved",
        payload: { type: "respond", message },
      },
    ]),
  );
  const result = String(resultOf(resumed.events, run.call)?.content);
  assert.deepEqual(
    {
      result,
      ran: result.includes("noted"),
      answered: said(resumed.events, "Noted."),
      last: resumed.events.at(-1)?.type,
      waits: (await record(run.id)).interrupts,
    },
    {
      result: message,
      ran: false,
      answered: true,
      last: "RUN_FINISHED",
      waits: [],
    },
  );
  assert.equal(await idle(run.id), true);
});

test("given a run that waits on a yes whose op does not allow respond, when the client resumes it with respond, then it is a reject that says respond is not allowed and the op does not run", async () => {
  await signIn("ana@example.com", "ana-key");
  const run = await asked("scarf", "Left as it is.");
  const [interrupt] = interruptsOf(run.events);
  const resumed = await eventsOf(
    await sent(run.id, run.chat, [
      {
        interruptId: interrupt!.id,
        status: "resolved",
        payload: { type: "respond", message: "The scarf is not for sale." },
      },
    ]),
  );
  const result = String(resultOf(resumed.events, run.call)?.content);
  assert.deepEqual(
    {
      notAllowed: result.includes("respond is not allowed"),
      voided: result.includes("voided"),
      answered: said(resumed.events, "Left as it is."),
    },
    { notAllowed: true, voided: false, answered: true },
  );
  assert.equal(await idle(run.id), true);
});

test("given a run that waits on a yes, when the client resumes it with a payload that matches no branch of the schema, then the route refuses the resume with 400 and the run still waits", async () => {
  await signIn("ana@example.com", "ana-key");
  const run = await asked("scarf", "Voided.");
  const [interrupt] = interruptsOf(run.events);
  const unknown = await sent(run.id, run.chat, [
    {
      interruptId: interrupt!.id,
      status: "resolved",
      payload: { type: "deny" },
    },
  ]);
  const typeless = await sent(run.id, run.chat, [
    { interruptId: interrupt!.id, status: "resolved", payload: {} },
  ]);
  // The route the behavior asks for ends no stream: only a code that took the answer gives one to cancel.
  if (unknown.status !== 400) await unknown.body?.cancel();
  if (typeless.status !== 400) await typeless.body?.cancel();
  const still = (await record(run.id)).interrupts;
  assert.deepEqual(
    {
      unknown: unknown.status,
      typeless: typeless.status,
      waits: still.map((held) => held.id),
    },
    { unknown: 400, typeless: 400, waits: [interrupt!.id] },
  );
  await sent(run.id, run.chat, [
    { interruptId: interrupt!.id, status: "cancelled" },
  ]).then((response) => response.body?.cancel());
  assert.equal(await idle(run.id), true);
});
