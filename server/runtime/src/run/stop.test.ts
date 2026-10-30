/**
 * A stop, through que's server listening on a port of its own: POST /threads/:id/stop ends the thread's run, the tool
 * call it was in shows aborted, the thread's record says it was stopped until its next run, and the next message runs
 * at once, also when the tool goes on after the stop.
 *
 * On a database of its own (PGlite, served on a local port) and the fixture deployment "tools", whose one agent uses
 * the plugin "till": `till-wait` gives its count after a second and a half, and `till-stall` after five seconds,
 * whatever happens to its run (it ignores the abort signal). In the place of Fireworks, pi-ai's scripted provider
 * (`faux`) answers under Fireworks' provider id, so no model is called.
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

/** How long till-stall takes, whatever happens to its run (the fixture's five seconds). */
const STALL_MS = 5_000;

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

const post = (threadId: string, messages: Message[]) =>
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
    }),
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

/** POST /threads/:id/stop: its status, and its answer's body as JSON (none when it is not JSON). */
const stop = async (threadId: string) => {
  const answered = await fetch(`${base}/threads/${threadId}/stop`, {
    method: "POST",
  });
  const text = await answered.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  return { status: answered.status, body };
};

/** The thread as GET /threads/:id gives it. */
const record = async (threadId: string) =>
  (await (await fetch(`${base}/threads/${threadId}`)).json()) as {
    stopped?: unknown;
    messages?: Message[];
  };

/** The text of an AG-UI content. */
const textOf = (content: unknown) =>
  typeof content === "string" ? content : JSON.stringify(content);

/** pi's result for a call of `op` that was aborted: its text tells the model the tool was aborted. */
const isAborted = (op: string, content: unknown) =>
  textOf(content).includes(`Tool ${op} was aborted`);

/**
 * A run on a new thread in which the model says "Counting. " and calls `op` for `item` under the call id `call`, then
 * would answer "It never gets here.": stopped through the route once the stream shows the call. Its thread, the
 * messages the client then holds (the user's, and the assistant's with its tool call, under the ids the stream gave),
 * the stop's status and its answer's body, and the run's events.
 */
async function stoppedInTool(op: string, item: string) {
  const id = await thread();
  const call = `${op}-${item}`;
  const u1 = user(`Count the ${item}.`);
  faux.setResponses([
    fauxAssistantMessage(
      [fauxText("Counting. "), fauxToolCall(op, { item }, { id: call })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(fauxText("It never gets here.")),
  ]);
  const calls = faux.state.callCount;
  let status = 0;
  let answer: unknown;
  let stoppedAt = 0;
  const { events, ended } = await eventsOf(await post(id, [u1]), {
    until: (e) => e.type === "TOOL_CALL_END",
    then: async () => {
      ({ status, body: answer } = await stop(id));
      stoppedAt = Date.now();
    },
  });
  const start = events.find((e) => e.type === "TOOL_CALL_START");
  const a1: Message = {
    id: String(start?.parentMessageId),
    role: "assistant",
    content: "Counting. ",
    toolCalls: [
      {
        id: call,
        type: "function",
        function: { name: op, arguments: JSON.stringify({ item }) },
      },
    ],
  };
  return {
    id,
    call,
    u1,
    a1,
    status,
    answer,
    stoppedAt,
    events,
    ended,
    modelCalls: faux.state.callCount - calls,
  };
}

test("given a run whose tool runs, when POST /threads/:id/stop is called, then it answers that it stopped a run, the run's stream ends, the tool call's result in the stream and in GET /threads/:id is pi's aborted result, and the model is not asked again", async () => {
  await signIn("ana@example.com", "ana-key");
  const seen = async (op: string, item: string) => {
    const run = await stoppedInTool(op, item);
    const result = run.events.find(
      (e) => e.type === "TOOL_CALL_RESULT" && e.toolCallId === run.call,
    );
    const messages = (await record(run.id)).messages ?? [];
    const tool = messages.find((m) => m.toolCallId === run.call);
    return {
      // The route takes the stop.
      taken: run.status >= 200 && run.status < 300,
      // The stop says it stopped a run.
      answer: run.answer,
      ended: run.ended,
      last: run.events.at(-1)?.type,
      streamed: isAborted(op, result?.content),
      held: isAborted(op, tool?.content),
      roles: messages.map((m) => m.role),
      answered: run.events.some(
        (e) =>
          e.type === "TEXT_MESSAGE_CONTENT" &&
          String(e.delta).includes("never"),
      ),
      modelCalls: run.modelCalls,
    };
  };
  const expected = {
    taken: true,
    answer: { stopped: true },
    ended: true,
    // A stop is no failure: the run ends as the user asked.
    last: "RUN_FINISHED",
    streamed: true,
    held: true,
    roles: ["user", "assistant", "tool"],
    answered: false,
    modelCalls: 1,
  };
  assert.deepEqual(
    {
      wait: await seen("till-wait", "pens"),
      stall: await seen("till-stall", "ink"),
    },
    { wait: expected, stall: expected },
  );
});

test("given threads whose runs ended, when GET /threads/:id is read, then a thread whose run was stopped says stopped, and says not stopped once its next message has run; a thread never run, or whose run finished, says not stopped", async () => {
  await signIn("ana@example.com", "ana-key");
  const never = await thread();

  const finished = await thread();
  faux.setResponses([fauxAssistantMessage(fauxText("Done."))]);
  await (await post(finished, [user("Hi")])).text();

  const pens = await stoppedInTool("till-wait", "pens");
  const ink = await stoppedInTool("till-wait", "ink");
  const afterStop = {
    pens: (await record(pens.id)).stopped,
    ink: (await record(ink.id)).stopped,
  };
  // The next message of pens runs; ink is left stopped.
  faux.setResponses([fauxAssistantMessage(fauxText("Fine."))]);
  await (await post(pens.id, [pens.u1, pens.a1, user("Never mind.")])).text();

  assert.deepEqual(
    {
      never: (await record(never)).stopped,
      finished: (await record(finished)).stopped,
      afterStop,
      afterNext: {
        pens: (await record(pens.id)).stopped,
        ink: (await record(ink.id)).stopped,
      },
    },
    {
      never: false,
      finished: false,
      afterStop: { pens: true, ink: true },
      afterNext: { pens: false, ink: true },
    },
  );
});

test("given threads with no run going, one never run and one whose run finished, when POST /threads/:id/stop is called on each, then the route answers that it stopped no run, and GET /threads/:id says neither is stopped", async () => {
  await signIn("ana@example.com", "ana-key");
  const never = await thread();
  const finished = await thread();
  faux.setResponses([fauxAssistantMessage(fauxText("Done."))]);
  await (await post(finished, [user("Hi")])).text();

  const idle = async (threadId: string) => {
    const { status, body } = await stop(threadId);
    return {
      taken: status >= 200 && status < 300,
      // The stop says it stopped no run.
      answer: body,
      stopped: (await record(threadId)).stopped,
    };
  };
  const expected = { taken: true, answer: { stopped: false }, stopped: false };
  assert.deepEqual(
    { never: await idle(never), finished: await idle(finished) },
    { never: expected, finished: expected },
  );
});

test("given a run stopped in a tool that ignores the abort signal (till-stall, five seconds), when the client sends its next message at once, then its answer comes long before the tool ends, and once the tool has ended the chat is still as the stop left it, with that answer last", async () => {
  await signIn("ana@example.com", "ana-key");
  const next = async (item: string) => {
    const run = await stoppedInTool("till-stall", item);
    const u2 = user(`Never mind the ${item}.`);
    faux.setResponses([fauxAssistantMessage(fauxText(`Fine, no ${item}.`))]);
    const sent = Date.now();
    const answer = await eventsOf(await post(run.id, [run.u1, run.a1, u2]));
    const answeredIn = Date.now() - sent;
    // The tool started before the stop; this is past its five seconds.
    await new Promise((past) =>
      setTimeout(
        past,
        Math.max(run.stoppedAt + STALL_MS + 500 - Date.now(), 0),
      ),
    );
    const chat = ((await record(run.id)).messages ?? []).map((m) =>
      m.role === "tool"
        ? [m.role, m.toolCallId, isAborted("till-stall", m.content)]
        : [m.role, m.id],
    );
    return {
      got: {
        // Well under what is left of the tool's five seconds.
        atOnce: answeredIn < 2_000,
        last: answer.events.at(-1)?.type,
        answer: answer.events
          .filter((e) => e.type === "TEXT_MESSAGE_CONTENT")
          .map((e) => e.delta)
          .join(""),
        chat,
      },
      expected: {
        atOnce: true,
        last: "RUN_FINISHED",
        answer: `Fine, no ${item}.`,
        chat: [
          ["user", run.u1.id],
          ["assistant", run.a1.id],
          // The tool's own result, when it came, is not written in the place of the stop's, nor after it.
          ["tool", run.call, true],
          ["user", u2.id],
          [
            "assistant",
            answer.events.find((e) => e.type === "TEXT_MESSAGE_START")
              ?.messageId,
          ],
        ],
      },
    };
  };
  const pens = await next("pens");
  const ink = await next("ink");
  assert.deepEqual(
    { pens: pens.got, ink: ink.got },
    { pens: pens.expected, ink: ink.expected },
  );
});

test("given a run of Bo's, when Ana calls POST /threads/:id/stop on his thread, or on a thread that is not there, then she gets 404, and Bo's run goes on to its answer", async () => {
  await signIn("bo@example.com", "bo-key");
  const bos = await thread();
  faux.setResponses([
    fauxAssistantMessage(
      [fauxToolCall("till-wait", { item: "nibs" }, { id: "wait-nibs" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(fauxText("There are 3 nibs.")),
  ]);
  let anas = 0;
  let nowhere = 0;
  const { events } = await eventsOf(
    await post(bos, [user("Count the nibs.")]),
    {
      until: (e) => e.type === "TOOL_CALL_END",
      then: async () => {
        process.env.DEV_USER_EMAIL = "ana@example.com";
        anas = (await stop(bos)).status;
        nowhere = (await stop(randomUUID())).status;
        process.env.DEV_USER_EMAIL = "bo@example.com";
      },
    },
  );
  const result = events.find((e) => e.type === "TOOL_CALL_RESULT");
  assert.deepEqual(
    {
      anas,
      nowhere,
      aborted: isAborted("till-wait", result?.content),
      answered: events
        .filter((e) => e.type === "TEXT_MESSAGE_CONTENT")
        .map((e) => e.delta)
        .join(""),
      stopped: (await record(bos)).stopped,
    },
    {
      anas: 404,
      nowhere: 404,
      aborted: false,
      answered: "There are 3 nibs.",
      stopped: false,
    },
  );
});
