/**
 * The branch rule, through que's server listening on a port of its own: how POST /threads/:id/runs reads the
 * `messages` of a RunAgentInput. The last message id the thread knows, against its conversation's head, says
 * whether the run goes on the same conversation, on a fork of it, or on a new one, or whether it is a resend that
 * makes no run. The thread's record is not read here: what it points at shows in what GET /threads/:id gives and in
 * what the model's next request holds.
 *
 * On a database of its own (PGlite, served on a local port) and the fixture deployment "tools", whose one agent uses
 * the plugin "till": `till-count` counts at once, and `till-wait` takes a second and a half, so a run can be stopped
 * while it runs. In the place of Fireworks, pi-ai's scripted provider (`faux`) answers under Fireworks' provider id,
 * so no model is called, and each of its answers records the request it answers.
 *
 * A stop is made as the UI makes one: the client drops its connection, which does not stop the run, and calls
 * POST /threads/:id/stop.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import type { Message as PiMessage } from "@earendil-works/pi-ai";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type FauxContentBlock,
  type FauxResponseStep,
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

process.env.DEV_USER_EMAIL = "ana@example.com";
{
  const saved = await fetch(`${base}/que/connections/till`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values: { key: "ana-key" } }),
  });
  assert.equal(saved.status, 200, await saved.clone().text());
}

type Event = { type: string; [field: string]: unknown };
type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};
type Message = {
  id: string;
  role: string;
  content?: unknown;
  toolCalls?: ToolCall[];
  toolCallId?: string;
};

/**
 * Each request the model got, as lines: `user: <text>`, `assistant: <text>`, and `tool <call id>: ok|error|aborted`,
 * aborted for the result pi writes for an aborted call, whose text tells the model the tool was aborted (pi's
 * stand-in for a result that is missing says something else).
 */
const requests: string[][] = [];

const textOf = (content: PiMessage["content"]) =>
  typeof content === "string"
    ? content
    : content
        .filter((part) => part.type === "text")
        .map((part) => ("text" in part ? part.text : ""))
        .join("");

const linesOf = (messages: readonly PiMessage[]) =>
  messages.flatMap((m) =>
    m.role === "user"
      ? [`user: ${textOf(m.content)}`]
      : m.role === "assistant"
        ? [`assistant: ${textOf(m.content)}`]
        : m.role === "toolResult"
          ? [
              `tool ${m.toolCallId}: ${
                !m.isError
                  ? "ok"
                  : textOf(m.content).includes(`Tool ${m.toolName} was aborted`)
                    ? "aborted"
                    : "error"
              }`,
            ]
          : [],
  );

/** An answer of the model's that records the request it answers. */
const answer =
  (content: string | FauxContentBlock[], toolUse = false): FauxResponseStep =>
  (request) => {
    requests.push(linesOf(request.messages));
    return fauxAssistantMessage(
      content,
      toolUse ? { stopReason: "toolUse" } : undefined,
    );
  };

/**
 * The AG-UI events of an SSE body, each `data:` line one event. At the first event `until` holds for, `then` is
 * called; with `drop`, the client then goes.
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

/** A thread of Ana's, made through POST /threads. */
const thread = async () =>
  (
    (await (await fetch(`${base}/threads`, { method: "POST" })).json()) as {
      id: string;
    }
  ).id;

/** A RunAgentInput for the thread, with `messages`; a resend gives the `runId` of the run it sends again. */
const input = (
  threadId: string,
  messages: Message[],
  runId: string = randomUUID(),
) => ({
  threadId,
  runId,
  messages,
  tools: [],
  context: [],
  state: {},
  forwardedProps: {},
});

const post = (
  threadId: string,
  body: ReturnType<typeof input>,
  signal?: AbortSignal,
) =>
  fetch(`${base}/threads/${threadId}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

/** A run sent as a client sends it, its events read whole. */
const run = async (threadId: string, messages: Message[], runId?: string) => {
  const sent = input(threadId, messages, runId);
  return { sent, events: await eventsOf(await post(threadId, sent)) };
};

/** The messages GET /threads/:id gives. */
const held = async (threadId: string) =>
  (
    (await (await fetch(`${base}/threads/${threadId}`)).json()) as {
      messages?: Message[];
    }
  ).messages ?? [];

/** The user and assistant messages GET /threads/:id gives, as `role id content`. */
const chat = async (threadId: string) =>
  (await held(threadId))
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => [m.role, m.id, m.content]);

/** The id of the run's assistant message whose text is `text`, as the stream gave it. */
const idOf = (events: Event[], text: string) => {
  const ids = [
    ...new Set(
      events
        .filter((e) => e.type === "TEXT_MESSAGE_CONTENT")
        .map((e) => String(e.messageId)),
    ),
  ];
  const id = ids.find(
    (id) =>
      events
        .filter((e) => e.type === "TEXT_MESSAGE_CONTENT" && e.messageId === id)
        .map((e) => e.delta)
        .join("") === text,
  );
  assert.ok(id, `the stream has an assistant message "${text}"`);
  return id;
};

const user = (content: string): Message => ({
  id: randomUUID(),
  role: "user",
  content,
});
const assistant = (id: string, content: string): Message => ({
  id,
  role: "assistant",
  content,
});

/**
 * A thread with two exchanges, sent as a client sends them: `u1`, its answer `a1`; `u2`, its answer `a2`. Each
 * message as the client holds it, with the ids the stream gave, and the
 * RunAgentInput of the second run.
 */
async function twoExchanges(first: string, second: string) {
  const id = await thread();
  const u1 = user(first);
  faux.setResponses([answer(`About ${first}.`)]);
  const a1 = assistant(
    idOf((await run(id, [u1])).events, `About ${first}.`),
    `About ${first}.`,
  );
  const u2 = user(second);
  faux.setResponses([answer(`About ${second}.`)]);
  const secondRun = await run(id, [u1, a1, u2]);
  const a2 = assistant(
    idOf(secondRun.events, `About ${second}.`),
    `About ${second}.`,
  );
  return { id, u1, a1, u2, a2, second: secondRun.sent };
}

test("given a thread with two exchanges, when the client sends an edit of its second message, then the run forks at the first answer: the model's request holds no trace of the old second exchange, the thread keeps its id, and the next send goes on the fork", async () => {
  const edits = async (first: string, second: string, edited: string) => {
    const { id, u1, a1 } = await twoExchanges(first, second);
    const u2edit = user(edited);
    faux.setResponses([answer(`About ${edited}.`)]);
    requests.length = 0;
    const editRun = await run(id, [u1, a1, u2edit]);
    const a2edit = assistant(
      idOf(editRun.events, `About ${edited}.`),
      `About ${edited}.`,
    );
    // A send after the edit, on the edited branch as the client holds it.
    const u3 = user("and then?");
    faux.setResponses([answer("Then more.")]);
    const next = await run(id, [u1, a1, u2edit, a2edit, u3]);
    const a3 = idOf(next.events, "Then more.");
    const threads = (await (await fetch(`${base}/threads`)).json()) as {
      id: string;
    }[];
    return {
      requests: [...requests],
      runsOn: [editRun.events.at(0)?.threadId, next.events.at(-1)?.threadId],
      listed: threads.filter((t) => t.id === id).length,
      chat: await chat(id),
      id,
      ids: { u1, a1, u2edit, a2edit, u3, a3 },
    };
  };
  for (const [first, second, edited] of [
    ["apples", "pears", "plums"],
    ["red", "green", "blue"],
  ]) {
    const got = await edits(first, second, edited);
    const { u1, a1, u2edit, a2edit, u3, a3 } = got.ids;
    assert.deepEqual(
      {
        requests: got.requests,
        runsOn: got.runsOn,
        listed: got.listed,
        chat: got.chat,
      },
      {
        requests: [
          // The edit's run: the first exchange, then the edited message, and nothing of `second`.
          [`user: ${first}`, `assistant: About ${first}.`, `user: ${edited}`],
          // The next send: on the fork, so the edited exchange is there and the old one is not.
          [
            `user: ${first}`,
            `assistant: About ${first}.`,
            `user: ${edited}`,
            `assistant: About ${edited}.`,
            "user: and then?",
          ],
        ],
        runsOn: [got.id, got.id],
        listed: 1,
        chat: [
          ["user", u1.id, first],
          ["assistant", a1.id, `About ${first}.`],
          ["user", u2edit.id, edited],
          ["assistant", a2edit.id, `About ${edited}.`],
          ["user", u3.id, "and then?"],
          ["assistant", a3, "Then more."],
        ],
      },
    );
  }
});

test("given a thread with two exchanges, when the client regenerates the second answer, then the run forks before it: the model's request ends at the second message, the new answer replaces the old one under a new id, and the next send goes on the fork", async () => {
  for (const [first, second] of [
    ["apples", "pears"],
    ["red", "green"],
  ]) {
    const { id, u1, a1, u2, a2 } = await twoExchanges(first, second);
    // A regenerate sends the chat up to the user message whose answer it makes again, in a run of its own.
    faux.setResponses([answer(`Again, ${second}.`)]);
    requests.length = 0;
    const again = await run(id, [u1, a1, u2]);
    const a2again = idOf(again.events, `Again, ${second}.`);
    const u3 = user("and then?");
    faux.setResponses([answer("Then more.")]);
    const next = await run(id, [
      u1,
      a1,
      u2,
      assistant(a2again, `Again, ${second}.`),
      u3,
    ]);
    const a3 = idOf(next.events, "Then more.");
    assert.notEqual(a2again, a2.id);
    assert.deepEqual(
      { requests: [...requests], chat: await chat(id) },
      {
        requests: [
          [`user: ${first}`, `assistant: About ${first}.`, `user: ${second}`],
          [
            `user: ${first}`,
            `assistant: About ${first}.`,
            `user: ${second}`,
            `assistant: Again, ${second}.`,
            "user: and then?",
          ],
        ],
        chat: [
          ["user", u1.id, first],
          ["assistant", a1.id, `About ${first}.`],
          ["user", u2.id, second],
          ["assistant", a2again, `Again, ${second}.`],
          ["user", u3.id, "and then?"],
          ["assistant", a3, "Then more."],
        ],
      },
    );
  }
});

test("given a thread with two exchanges, when the client sends an edit of its first message, then the run is on a new conversation: the model's request holds only the edited message, GET /threads/:id gives only the new exchange, and the thread keeps its id", async () => {
  for (const [first, second, edited] of [
    ["apples", "pears", "plums"],
    ["red", "green", "blue"],
  ]) {
    const { id } = await twoExchanges(first, second);
    const u1edit = user(edited);
    faux.setResponses([answer(`About ${edited}.`)]);
    requests.length = 0;
    const editRun = await run(id, [u1edit]);
    const a1edit = idOf(editRun.events, `About ${edited}.`);
    assert.deepEqual(
      {
        requests: [...requests],
        threadId: editRun.events.at(-1)?.threadId,
        chat: await chat(id),
      },
      {
        requests: [[`user: ${edited}`]],
        threadId: id,
        chat: [
          ["user", u1edit.id, edited],
          ["assistant", a1edit, `About ${edited}.`],
        ],
      },
    );
  }
});

test("given a thread whose first answer came after a tool round, when the client edits the message after it, then GET /threads/:id gives each message before the fork point the id it had before: the user message, the assistant message with its toolCalls, the tool message and the answer", async () => {
  for (const item of ["pens", "ink"]) {
    const id = await thread();
    const u1 = user(`How many ${item}?`);
    const call = `call-${item}`;
    faux.setResponses([
      answer(
        [
          fauxText("Let me count. "),
          fauxToolCall("till-count", { item }, { id: call }),
        ],
        true,
      ),
      answer(`There are ${item}.`),
    ]);
    await run(id, [u1]);
    // The chat as the client holds it, from GET: the tool round and the answer.
    const before = await held(id);
    const u2 = user("And the rest?");
    faux.setResponses([answer("The rest is gone.")]);
    await run(id, [...before, u2]);
    const u2edit = user("And the others?");
    faux.setResponses([answer("The others are here.")]);
    const editRun = await run(id, [...before, u2edit]);
    const after = await held(id);
    assert.deepEqual(after.slice(0, before.length), before);
    assert.deepEqual(
      after.slice(before.length).map((m) => [m.role, m.id, m.content]),
      [
        ["user", u2edit.id, "And the others?"],
        [
          "assistant",
          idOf(editRun.events, "The others are here."),
          "The others are here.",
        ],
      ],
    );
    // What was kept is the tool round, so the ids it kept are the ids of a tool round.
    assert.deepEqual(
      before.map((m) => [m.role, m.toolCalls?.map((c) => c.id), m.toolCallId]),
      [
        ["user", undefined, undefined],
        ["assistant", [call], undefined],
        ["tool", undefined, call],
        ["assistant", undefined, undefined],
      ],
    );
  }
});

test("given a thread whose answer came after a tool round, when the client sends its next message with the turn joined as one message, then the run stays on the conversation: the model's request holds the turn's answer, and GET /threads/:id gives the turn whole and the new exchange after it", async () => {
  // The turn's first message with text before its tool call, and with none, as a model calls a tool at once.
  for (const [item, said] of [
    ["pens", "Let me count. "],
    ["ink", ""],
  ]) {
    const id = await thread();
    const u1 = user(`How many ${item}?`);
    const call = `call-joined-${item}`;
    faux.setResponses([
      answer(
        [
          ...(said ? [fauxText(said)] : []),
          fauxToolCall("till-count", { item }, { id: call }),
        ],
        true,
      ),
      answer(`There are ${item}.`),
    ]);
    await run(id, [u1]);
    const turn = await held(id);
    const [, first, result] = turn;
    // A client that shows a turn as one reply sends it as one assistant message: the turn's first id, its text
    // whole, and its tool call, then the call's result.
    const joined: Message = {
      id: first.id,
      role: "assistant",
      content: `${said}There are ${item}.`,
      toolCalls: first.toolCalls,
    };
    const u2 = user("And the rest?");
    faux.setResponses([answer("The rest is gone.")]);
    requests.length = 0;
    const next = await run(id, [u1, joined, result, u2]);
    assert.deepEqual(
      {
        requests: [...requests],
        chat: (await held(id)).map((m) => [m.role, m.id]),
      },
      {
        requests: [
          [
            `user: How many ${item}?`,
            `assistant: ${said}`,
            `tool ${call}: ok`,
            `assistant: There are ${item}.`,
            "user: And the rest?",
          ],
        ],
        chat: [
          ...turn.map((m) => [m.role, m.id]),
          ["user", u2.id],
          ["assistant", idOf(next.events, "The rest is gone.")],
        ],
      },
    );
  }
});

test("given a thread whose answer came after a tool round and a second exchange after it, when the client edits the second message with the turn joined as one message, then the run forks after the turn's answer: the model's request and GET /threads/:id hold the answer", async () => {
  for (const [item, said] of [
    ["pens", "Let me count. "],
    ["ink", ""],
  ]) {
    const id = await thread();
    const u1 = user(`How many ${item}?`);
    const call = `call-edit-${item}`;
    faux.setResponses([
      answer(
        [
          ...(said ? [fauxText(said)] : []),
          fauxToolCall("till-count", { item }, { id: call }),
        ],
        true,
      ),
      answer(`There are ${item}.`),
    ]);
    await run(id, [u1]);
    const turn = await held(id);
    const [, first, result] = turn;
    // The turn as the UI holds it: one assistant message under its first id, its text whole, its tool call, and the result.
    const joined: Message = {
      id: first.id,
      role: "assistant",
      content: `${said}There are ${item}.`,
      toolCalls: first.toolCalls,
    };
    const u2 = user("And the rest?");
    faux.setResponses([answer("The rest is gone.")]);
    const second = await run(id, [u1, joined, result, u2]);
    // The second exchange is on the thread before the edit.
    idOf(second.events, "The rest is gone.");
    const u2edit = user("And the others?");
    faux.setResponses([answer("The others are here.")]);
    requests.length = 0;
    const edit = await run(id, [u1, joined, result, u2edit]);
    assert.deepEqual(
      {
        requests: [...requests],
        chat: (await held(id)).map((m) => [m.role, m.id]),
      },
      {
        requests: [
          [
            `user: How many ${item}?`,
            `assistant: ${said}`,
            `tool ${call}: ok`,
            `assistant: There are ${item}.`,
            "user: And the others?",
          ],
        ],
        chat: [
          ...turn.map((m) => [m.role, m.id]),
          ["user", u2edit.id],
          ["assistant", idOf(edit.events, "The others are here.")],
        ],
      },
    );
  }
});

/** The thread's run, stopped through POST /threads/:id/stop. */
async function stop(threadId: string) {
  const stopped = await fetch(`${base}/threads/${threadId}/stop`, {
    method: "POST",
  });
  assert.ok(
    stopped.ok,
    `the stop was taken: ${stopped.status} ${await stopped.text()}`,
  );
}

test("given a run stopped while its tool runs, when the client sends its next message with the tool call but not the aborted result, then the run stays on the conversation, and the model's request holds the aborted result", async () => {
  for (const item of ["pens", "ink"]) {
    const id = await thread();
    const u1 = user(`Count the ${item} slowly.`);
    const call = `wait-${item}`;
    faux.setResponses([
      answer(
        [
          fauxText("Counting. "),
          fauxToolCall("till-wait", { item }, { id: call }),
        ],
        true,
      ),
      answer("It never gets here."),
    ]);
    const drop = new AbortController();
    const seen = await eventsOf(await post(id, input(id, [u1]), drop.signal), {
      until: (e) => e.type === "TOOL_CALL_END",
      drop,
    });
    // The tool runs now: the client goes, and the run is stopped.
    await stop(id);
    const start = seen.find((e) => e.type === "TOOL_CALL_START");
    const a1: Message = {
      id: String(start?.parentMessageId),
      role: "assistant",
      content: "Counting. ",
      toolCalls: [
        {
          id: call,
          type: "function",
          function: { name: "till-wait", arguments: JSON.stringify({ item }) },
        },
      ],
    };
    const u2 = user("Never mind.");
    faux.setResponses([answer("Fine.")]);
    requests.length = 0;
    const next = await run(id, [u1, a1, u2]);
    assert.deepEqual(
      {
        requests: [...requests],
        chat: (await chat(id)).map(([role, messageId]) => [role, messageId]),
      },
      {
        requests: [
          [
            `user: Count the ${item} slowly.`,
            "assistant: Counting. ",
            `tool ${call}: aborted`,
            "user: Never mind.",
          ],
        ],
        chat: [
          ["user", u1.id],
          ["assistant", a1.id],
          ["user", u2.id],
          ["assistant", idOf(next.events, "Fine.")],
        ],
      },
    );
  }
});

test("given a run that has answered, when the client sends the same RunAgentInput again, then no second run is made: the model is not called again, and GET /threads/:id holds the one answer", async () => {
  // The first message of a thread, sent again.
  const first = await thread();
  const hi = user("Hi");
  faux.setResponses([answer("Hello."), answer("Hello again.")]);
  const once = await run(first, [hi]);
  let calls = faux.state.callCount;
  const firstAgain = await eventsOf(await post(first, once.sent));
  const firstCalls = faux.state.callCount - calls;

  // A later message of a thread, sent again.
  const { id, u1, a1, u2, a2, second } = await twoExchanges("apples", "pears");
  faux.setResponses([answer("Pears, again.")]);
  calls = faux.state.callCount;
  const laterAgain = await eventsOf(await post(id, second));
  const laterCalls = faux.state.callCount - calls;

  // The resend's stream is the run's frame alone: it opens and finishes, under the run it sends again.
  const frames = (events: Event[]) =>
    events.map((e) => ({ type: e.type, threadId: e.threadId, runId: e.runId }));
  assert.deepEqual(
    { first: frames(firstAgain), later: frames(laterAgain) },
    {
      first: [
        { type: "RUN_STARTED", threadId: first, runId: once.sent.runId },
        { type: "RUN_FINISHED", threadId: first, runId: once.sent.runId },
      ],
      later: [
        { type: "RUN_STARTED", threadId: id, runId: second.runId },
        { type: "RUN_FINISHED", threadId: id, runId: second.runId },
      ],
    },
  );

  assert.deepEqual(
    {
      first: { calls: firstCalls, chat: await chat(first) },
      later: { calls: laterCalls, chat: await chat(id) },
    },
    {
      first: {
        calls: 0,
        chat: [
          ["user", hi.id, "Hi"],
          ["assistant", idOf(once.events, "Hello."), "Hello."],
        ],
      },
      later: {
        calls: 0,
        chat: [
          ["user", u1.id, u1.content],
          ["assistant", a1.id, a1.content],
          ["user", u2.id, u2.content],
          ["assistant", a2.id, a2.content],
        ],
      },
    },
  );
});

test("given a run that goes, when the client sends its next message and sends that same RunAgentInput again before the message is placed, then no second run is made: the model gets the message once, and GET /threads/:id holds one answer to it", async () => {
  for (const item of ["pens", "ink"]) {
    const id = await thread();
    const u1 = user(`Count the ${item} slowly.`);
    const call = `wait-${item}`;
    const u3 = user(`And the ${item} in the back?`);
    faux.setResponses([
      answer(
        [
          fauxText("Counting. "),
          fauxToolCall("till-wait", { item }, { id: call }),
        ],
        true,
      ),
      answer(`There are 3 ${item}.`),
      answer(`In the back, 2 ${item}.`),
      answer(`In the back, 2 ${item}, again.`),
    ]);
    requests.length = 0;
    // R1 goes; while till-wait runs, the client sends u3 as R2, and sends R2 again: a retry, before u3 is placed.
    let sent!: (both: Promise<Event[][]>) => void;
    const retried = new Promise<Promise<Event[][]>>((r) => (sent = r));
    // The assistant message of the call, under the id the stream gave it.
    let a1 = "";
    const r1 = eventsOf(await post(id, input(id, [u1])), {
      until: (e) => {
        if (e.type === "TOOL_CALL_START") a1 = String(e.parentMessageId);
        return e.type === "TOOL_CALL_END";
      },
      then: () => {
        const r2 = input(id, [
          u1,
          {
            id: a1,
            role: "assistant",
            content: "Counting. ",
            toolCalls: [
              {
                id: call,
                type: "function",
                function: {
                  name: "till-wait",
                  arguments: JSON.stringify({ item }),
                },
              },
            ],
          },
          u3,
        ]);
        sent(
          (async () => {
            const first = await post(id, r2);
            const again = await post(id, r2);
            return Promise.all([eventsOf(first), eventsOf(again)]);
          })(),
        );
      },
    });
    await r1;
    await await retried;
    const chatNow = await chat(id);
    assert.deepEqual(
      {
        asked: requests.filter((r) => r.at(-1) === `user: ${u3.content}`)
          .length,
        answers: chatNow
          .slice(chatNow.findIndex(([, messageId]) => messageId === u3.id) + 1)
          .map(([role, , content]) => [role, content]),
      },
      {
        asked: 1,
        answers: [["assistant", `In the back, 2 ${item}.`]],
      },
    );
  }
});
