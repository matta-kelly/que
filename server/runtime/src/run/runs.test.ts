/**
 * A run on pi, through que's server listening on a port of its own: POST
 * /threads/:id/runs takes AG-UI's RunAgentInput and streams the answer as
 * AG-UI events over SSE. On a database of its own (PGlite, served on a local
 * port) and the fixture deployment "two", whose one agent runs on the model
 * config "small" (`fireworks:small-model`). In the place of Fireworks, pi-ai's
 * scripted provider (`faux`) answers under Fireworks' provider id, so no model
 * is called.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxThinking,
} from "@earendil-works/pi-ai/providers/faux";
import { deploymentRoot } from "../../../tests/deployment-root.js";

const db = await PGlite.create();
const database = new PGLiteSocketServer({ db, port: 0, maxConnections: 100 });
await database.start();
process.env.DATABASE_URL = `postgresql://postgres@${database.getServerConn()}/postgres`;
process.env.QUE_DEPLOYMENT = deploymentRoot(
  join(import.meta.dirname, "../../../tests/integration/mount/fixtures"),
  "two",
);
delete process.env.DEV_USER_EMAIL;
delete process.env.DEV_USER_NAME;
const { app } = await import("../serve.js");
const { models } = await import("../runner/pi/harness.js");

// Paced, so a client can drop its connection while the answer streams.
const faux = fauxProvider({
  provider: "fireworks",
  models: [{ id: "small-model", reasoning: true, contextWindow: 64_000 }],
  tokensPerSecond: 400,
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

process.env.DEV_USER_EMAIL = "ana@example.com";

type Event = { type: string; [field: string]: unknown };
type Message = { id: string; role: string; content?: unknown };

/** A thread of Ana's, made through POST /threads. */
const thread = async () => {
  const made = await fetch(`${base}/threads`, { method: "POST" });
  return ((await made.json()) as { id: string }).id;
};

/** A run's RunAgentInput: the thread's messages, the client's last one the new one. */
const input = (threadId: string, messages: Message[]) => ({
  threadId,
  runId: randomUUID(),
  messages,
  tools: [],
  context: [],
  state: {},
  forwardedProps: {},
});

/**
 * The AG-UI events of an SSE body, each `data:` line one event. At the first
 * event `at.until` holds for, `at.then` is called; with `at.drop`, the client
 * then drops its connection.
 */
async function eventsOf(
  response: Response,
  at?: {
    until: (event: Event) => boolean;
    then?: () => void;
    drop?: AbortController;
  },
): Promise<Event[]> {
  const events: Event[] = [];
  if (!response.body) return events;
  const decoder = new TextDecoder();
  let rest = "";
  let reached = false;
  try {
    for await (const chunk of response.body) {
      rest += decoder.decode(chunk as Uint8Array, { stream: true });
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
          at.then?.();
          if (at.drop) {
            at.drop.abort();
            return events;
          }
        }
      }
    }
  } catch (error) {
    if (!at?.drop?.signal.aborted) throw error;
  }
  return events;
}

/**
 * A run's POST, sent as a client sends it: to the thread `threadId`, with an
 * input that names the thread `named`. Its input, and the response.
 */
const send = async (
  threadId: string,
  messages: Message[],
  named = threadId,
  signal?: AbortSignal,
) => {
  const sent = input(named, messages);
  const response = await fetch(`${base}/threads/${threadId}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sent),
    signal,
  });
  return { sent, response };
};

/** A run, sent as a client sends it: its input, and the events it streams back whole. */
const run = async (threadId: string, messages: Message[], named = threadId) => {
  const { sent, response } = await send(threadId, messages, named);
  return { sent, events: await eventsOf(response) };
};

/** The messages GET /threads/:id gives for the thread. */
const messagesOf = async (threadId: string) =>
  (
    (await (await fetch(`${base}/threads/${threadId}`)).json()) as {
      messages?: Message[];
    }
  ).messages ?? [];

/** The deltas of the events of one type, joined. */
const joined = (events: Event[], type: string) =>
  events
    .filter((e) => e.type === type)
    .map((e) => e.delta)
    .join("");

/** The id of the answer's assistant message, as its TEXT_MESSAGE_START gives it. */
const assistantId = (events: Event[]) =>
  events.find((e) => e.type === "TEXT_MESSAGE_START")?.messageId;

/** What an event says of the run it frames. */
const frame = (event: Event | undefined) => ({
  type: event?.type,
  threadId: event?.threadId,
  runId: event?.runId,
});

/** The types of the events in order, each run of one type given once. */
const typesOf = (events: Event[]) =>
  events.map((e) => e.type).filter((type, i, types) => type !== types[i - 1]);

/**
 * The thread's user and assistant messages, read from GET /threads/:id until
 * there are `count` of them, for ten seconds at most: the last ones read.
 */
async function heldMessages(threadId: string, count: number) {
  const deadline = Date.now() + 10_000;
  let held: Message[] = [];
  while (Date.now() < deadline && held.length < count) {
    await new Promise((wait) => setTimeout(wait, 100));
    held = (await messagesOf(threadId)).filter(
      (m) => m.role === "user" || m.role === "assistant",
    );
  }
  return held;
}

/**
 * The thread's assistant message once it holds `answer`, read from GET
 * /threads/:id until it does, for ten seconds at most: the last one read.
 */
async function heldAnswer(threadId: string, answer: string) {
  const deadline = Date.now() + 10_000;
  let held: Message | undefined;
  while (Date.now() < deadline && held?.content !== answer) {
    await new Promise((wait) => setTimeout(wait, 100));
    held = (await messagesOf(threadId)).find((m) => m.role === "assistant");
  }
  return held;
}

test("a message streams its answer as AG-UI events: the model's reasoning as reasoning, its text as text, in one run", async () => {
  const id = await thread();
  faux.setResponses([
    fauxAssistantMessage([
      fauxThinking("Ana greets me, so I greet her back."),
      fauxText("Hello, Ana. What can I do for you?"),
    ]),
  ]);
  const { sent, events } = await run(id, [
    { id: randomUUID(), role: "user", content: "Hi" },
  ]);
  assert.deepEqual(
    {
      first: frame(events.at(0)),
      reasoning: joined(events, "REASONING_MESSAGE_CONTENT"),
      text: joined(events, "TEXT_MESSAGE_CONTENT"),
      last: frame(events.at(-1)),
    },
    {
      first: { type: "RUN_STARTED", threadId: id, runId: sent.runId },
      reasoning: "Ana greets me, so I greet her back.",
      text: "Hello, Ana. What can I do for you?",
      last: { type: "RUN_FINISHED", threadId: id, runId: sent.runId },
    },
  );
  // The text is one assistant message: each of its events names the message its start opened.
  const start = events.find((e) => e.type === "TEXT_MESSAGE_START");
  assert.equal(start?.role, "assistant");
  assert.deepEqual(
    [
      ...new Set(
        events
          .filter((e) => e.type.startsWith("TEXT_MESSAGE_"))
          .map((e) => e.messageId),
      ),
    ],
    [start?.messageId],
  );

  // Another answer, on another thread: what streams is the model's, not a constant.
  const other = await thread();
  faux.setResponses([
    fauxAssistantMessage([
      fauxThinking("A sum. Two and two make four."),
      fauxText("2 + 2 = 4."),
    ]),
  ]);
  const second = await run(other, [
    { id: randomUUID(), role: "user", content: "What is 2 + 2?" },
  ]);
  assert.deepEqual(
    {
      reasoning: joined(second.events, "REASONING_MESSAGE_CONTENT"),
      text: joined(second.events, "TEXT_MESSAGE_CONTENT"),
    },
    { reasoning: "A sum. Two and two make four.", text: "2 + 2 = 4." },
  );
});

test("a client that drops its connection while the answer streams does not stop the run: GET /threads/:id has the whole answer after", async () => {
  const id = await thread();
  // Long enough, at the faux's pace, to stream for about a second.
  const answer = Array.from(
    { length: 40 },
    (_, i) => `Sentence ${i + 1} of the answer is here.`,
  ).join(" ");
  faux.setResponses([fauxAssistantMessage(fauxText(answer))]);
  const controller = new AbortController();
  const { response } = await send(
    id,
    [{ id: randomUUID(), role: "user", content: "Tell me more" }],
    id,
    controller.signal,
  );
  // The client goes at the first piece of the text, before the rest has streamed.
  const seen = await eventsOf(response, {
    until: (event) => event.type === "TEXT_MESSAGE_CONTENT",
    drop: controller,
  });
  assert.ok(joined(seen, "TEXT_MESSAGE_CONTENT").length < answer.length);

  // The run goes on with no client, so the thread holds the whole answer once it ends.
  assert.equal((await heldAnswer(id, answer))?.content, answer);
});

test("the ids a viewer gets while the answer streams are the ids GET /threads/:id gives after: the client's for a user message, the stream's for an assistant message", async () => {
  const id = await thread();
  const hi = { id: randomUUID(), role: "user", content: "Hi" };
  faux.setResponses([fauxAssistantMessage(fauxText("Hello, Ana."))]);
  const helloId = assistantId((await run(id, [hi])).events);

  // The next message, sent as a client sends it: the thread so far, with the ids it streamed.
  const more = { id: randomUUID(), role: "user", content: "And then?" };
  faux.setResponses([fauxAssistantMessage(fauxText("Then we talk."))]);
  const thenId = assistantId(
    (
      await run(id, [
        hi,
        { id: String(helloId), role: "assistant", content: "Hello, Ana." },
        more,
      ])
    ).events,
  );

  assert.deepEqual(
    (await messagesOf(id))
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => [m.role, m.id]),
    [
      ["user", hi.id],
      ["assistant", helloId],
      ["user", more.id],
      ["assistant", thenId],
    ],
  );
  // Each assistant message has an id of its own.
  assert.notEqual(thenId, helloId);
});

test("a good run streams its events in AG-UI's order: the run opens, the reasoning streams and ends, the text streams and ends, the run finishes", async () => {
  const id = await thread();
  faux.setResponses([
    fauxAssistantMessage([
      fauxThinking("Ana asks the time, which I do not know."),
      fauxText("I do not know the time, Ana."),
    ]),
  ]);
  const { events } = await run(id, [
    { id: randomUUID(), role: "user", content: "What time is it?" },
  ]);
  assert.deepEqual(typesOf(events), [
    "RUN_STARTED",
    "REASONING_START",
    "REASONING_MESSAGE_START",
    "REASONING_MESSAGE_CONTENT",
    "REASONING_MESSAGE_END",
    "REASONING_END",
    "TEXT_MESSAGE_START",
    "TEXT_MESSAGE_CONTENT",
    "TEXT_MESSAGE_END",
    "RUN_FINISHED",
  ]);

  // An answer with no reasoning streams no reasoning events.
  faux.setResponses([fauxAssistantMessage(fauxText("It is late, Ana."))]);
  const plain = await run(id, [
    { id: randomUUID(), role: "user", content: "Guess" },
  ]);
  assert.deepEqual(typesOf(plain.events), [
    "RUN_STARTED",
    "TEXT_MESSAGE_START",
    "TEXT_MESSAGE_CONTENT",
    "TEXT_MESSAGE_END",
    "RUN_FINISHED",
  ]);
});

test("a POST whose body is not a RunAgentInput gets 400", async () => {
  const id = await thread();
  const statusOf = async (body: string) =>
    (
      await fetch(`${base}/threads/${id}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      })
    ).status;
  assert.deepEqual(
    {
      notJson: await statusOf("Hi"),
      empty: await statusOf("{}"),
      messagesNotAList: await statusOf(
        JSON.stringify({ ...input(id, []), messages: "Hi" }),
      ),
    },
    { notJson: 400, empty: 400, messagesNotAList: 400 },
  );
});

test("a run's RUN_STARTED and RUN_FINISHED name the thread of the URL, also when the body names another thread", async () => {
  const id = await thread();
  const other = await thread();
  const hi = () => [{ id: randomUUID(), role: "user", content: "Hi" }];
  const threadIds = (events: Event[]) => [
    events.at(0)?.threadId,
    events.at(-1)?.threadId,
  ];

  faux.setResponses([fauxAssistantMessage(fauxText("Hello, Ana."))]);
  const named = await run(id, hi(), other);
  faux.setResponses([fauxAssistantMessage(fauxText("Hello again."))]);
  const unknown = await run(id, hi(), randomUUID());

  assert.deepEqual(
    { named: threadIds(named.events), unknown: threadIds(unknown.events) },
    { named: [id, id], unknown: [id, id] },
  );
});

test("a model call that fails ends the run with AG-UI's RUN_ERROR, which holds the error's message, in the place of RUN_FINISHED", async () => {
  const fails = async (errorMessage: string) => {
    const id = await thread();
    faux.setResponses([
      fauxAssistantMessage([], { stopReason: "error", errorMessage }),
    ]);
    const { events } = await run(id, [
      { id: randomUUID(), role: "user", content: "Hi" },
    ]);
    const last = events.at(-1);
    return {
      last: { type: last?.type, message: last?.message },
      finished: events.some((e) => e.type === "RUN_FINISHED"),
    };
  };
  assert.deepEqual(
    {
      overloaded: await fails("The model is overloaded."),
      refused: await fails("401 Unauthorized: the API key is not valid."),
    },
    {
      overloaded: {
        last: { type: "RUN_ERROR", message: "The model is overloaded." },
        finished: false,
      },
      refused: {
        last: {
          type: "RUN_ERROR",
          message: "401 Unauthorized: the API key is not valid.",
        },
        finished: false,
      },
    },
  );
});

test("two messages sent close together on one thread run one after the other: each viewer gets only its own run, under its own ids, and GET /threads/:id has both, in order", async () => {
  const id = await thread();
  // Long enough, at the faux's pace, to stream for about a second.
  const first = Array.from(
    { length: 40 },
    (_, i) => `Part ${i + 1} of the first answer.`,
  ).join(" ");
  const second = "The second answer, after the first.";
  faux.setResponses([
    fauxAssistantMessage(fauxText(first)),
    fauxAssistantMessage(fauxText(second)),
  ]);
  const one = { id: randomUUID(), role: "user", content: "Tell me a lot" };
  const two = { id: randomUUID(), role: "user", content: "And one more" };

  // Viewer A sends; viewer B sends while A's answer streams.
  const a = await send(id, [one]);
  let streaming = () => {};
  const busy = new Promise<void>((started) => (streaming = started));
  const aEvents = eventsOf(a.response, {
    until: (event) => event.type === "TEXT_MESSAGE_CONTENT",
    then: () => streaming(),
  });
  await busy;
  const b = await run(id, [one, two]);
  const aRun = { sent: a.sent, events: await aEvents };

  const seen = ({ events }: { events: Event[] }) => ({
    first: frame(events.at(0)),
    text: joined(events, "TEXT_MESSAGE_CONTENT"),
    last: frame(events.at(-1)),
  });
  assert.deepEqual(
    { a: seen(aRun), b: seen(b) },
    {
      a: {
        first: { type: "RUN_STARTED", threadId: id, runId: a.sent.runId },
        text: first,
        last: { type: "RUN_FINISHED", threadId: id, runId: a.sent.runId },
      },
      b: {
        first: { type: "RUN_STARTED", threadId: id, runId: b.sent.runId },
        text: second,
        last: { type: "RUN_FINISHED", threadId: id, runId: b.sent.runId },
      },
    },
  );

  // Each answer is held under the id its viewer streamed it with.
  assert.deepEqual(
    (await heldMessages(id, 4)).map((m) => [m.role, m.id, m.content]),
    [
      ["user", one.id, one.content],
      ["assistant", assistantId(aRun.events), first],
      ["user", two.id, two.content],
      ["assistant", assistantId(b.events), second],
    ],
  );
  assert.notEqual(assistantId(aRun.events), assistantId(b.events));
});
