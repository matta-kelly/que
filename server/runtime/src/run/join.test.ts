/**
 * A join, through que's server listening on a port of its own: GET /threads/:id/join gives a viewer the thread's chat
 * while its run goes (AG-UI's RUN_STARTED, a MESSAGES_SNAPSHOT of the chat, the answer so far, then the live tail), so a
 * client that reloads, or a second viewer, ends with the same chat, under the same ids, as GET /threads/:id gives after.
 * Another user's thread gets the same 404 from the join as from GET /threads/:id.
 *
 * On a database of its own (PGlite, served on a local port) and the fixture deployment "tools", whose one agent uses
 * the plugin "till": `till-wait` gives its count after a second and a half. In the place of Fireworks, pi-ai's scripted
 * provider (`faux`) answers under Fireworks' provider id, paced so that a long answer streams for some seconds.
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

// Paced, so a viewer can join while the answer streams.
const faux = fauxProvider({
  provider: "fireworks",
  models: [{ id: "small-model", contextWindow: 64_000 }],
  tokensPerSecond: 50,
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

/** An answer long enough, at the faux's pace, to stream for some seconds. */
const long = (name: string) =>
  Array.from(
    { length: 20 },
    (_, i) => `Line ${i + 1} of ${name}'s answer is here.`,
  ).join(" ");

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

const post = (threadId: string, messages: Message[], signal?: AbortSignal) =>
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
    signal,
  });

/** GET /threads/:id/join. */
const joinOf = (threadId: string, signal?: AbortSignal) =>
  fetch(`${base}/threads/${threadId}/join`, { signal });

/** The thread's messages, as GET /threads/:id gives them. */
const messagesOf = async (threadId: string) =>
  (
    (await (await fetch(`${base}/threads/${threadId}`)).json()) as {
      messages?: Message[];
    }
  ).messages ?? [];

type Seen = { event: Event; at: number };

/**
 * The AG-UI events of an SSE body, each with the time it came, read to the end of the stream. At the first event
 * `until` holds for, `then` is called and awaited; with `drop`, the read then ends there, as a client that goes does,
 * and its connection is closed. A stream that has not ended in 60 seconds ends the read, with `ended` false.
 */
async function eventsOf(
  response: Response,
  at?: {
    until: (event: Event) => boolean;
    then?: () => unknown;
    drop?: AbortController;
  },
): Promise<{ seen: Seen[]; ended: boolean }> {
  const seen: Seen[] = [];
  if (!response.body) return { seen, ended: true };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + 60_000;
  let rest = "";
  let reached = false;
  for (;;) {
    const read = await Promise.race([
      reader.read(),
      new Promise<"late">((late) =>
        setTimeout(() => late("late"), Math.max(deadline - Date.now(), 0)),
      ),
    ]);
    if (read === "late") {
      await reader.cancel();
      return { seen, ended: false };
    }
    if (read.done) return { seen, ended: true };
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
      seen.push({ event, at: Date.now() });
      if (!reached && at?.until(event)) {
        reached = true;
        await at.then?.();
        if (at.drop) {
          at.drop.abort();
          await reader.cancel().catch(() => {});
          return { seen, ended: false };
        }
      }
    }
  }
}

const events = (seen: Seen[]) => seen.map((s) => s.event);

/**
 * The chat a viewer holds after `events`, from the messages `start` it held before them, applied as AG-UI's client
 * applies them: a snapshot is the chat; a text message's start adds a message, and its content goes on the last
 * message of that id; a tool call goes on its parent message, and a tool call's result adds a tool message.
 */
function chatOf(start: readonly Message[], events: readonly Event[]) {
  let chat: Message[] = structuredClone([...start]);
  const last = (id: unknown) => [...chat].reverse().find((m) => m.id === id);
  const calls = new Map<string, ToolCall>();
  for (const event of events) {
    switch (event.type) {
      case "MESSAGES_SNAPSHOT":
        chat = structuredClone(event.messages as Message[]);
        break;
      case "TEXT_MESSAGE_START":
        chat.push({
          id: String(event.messageId),
          role: "assistant",
          content: "",
        });
        break;
      case "TEXT_MESSAGE_CONTENT": {
        const message = last(event.messageId);
        if (message)
          message.content = `${String(message.content ?? "")}${String(event.delta)}`;
        else
          chat.push({
            id: `no start for ${String(event.messageId)}`,
            role: "assistant",
            content: event.delta,
          });
        break;
      }
      case "TOOL_CALL_START": {
        let parent = last(event.parentMessageId);
        if (!parent) {
          parent = { id: String(event.parentMessageId), role: "assistant" };
          chat.push(parent);
        }
        const call: ToolCall = {
          id: String(event.toolCallId),
          type: "function",
          function: { name: String(event.toolCallName), arguments: "" },
        };
        parent.toolCalls = [...(parent.toolCalls ?? []), call];
        calls.set(call.id, call);
        break;
      }
      case "TOOL_CALL_ARGS": {
        const call = calls.get(String(event.toolCallId));
        if (call) call.function.arguments += String(event.delta);
        break;
      }
      case "TOOL_CALL_RESULT":
        chat.push({
          id: String(event.messageId),
          role: "tool",
          toolCallId: String(event.toolCallId),
          content: event.content,
        });
        break;
    }
  }
  return chat;
}

/** A chat, as a list to compare: each message's role, id, text, tool calls and call id. */
const shown = (chat: readonly Message[]) =>
  chat.map((m) => ({
    role: m.role,
    id: m.id,
    content: typeof m.content === "string" ? m.content : (m.content ?? ""),
    toolCalls: (m.toolCalls ?? []).map((c) => [
      c.id,
      c.function.name,
      c.function.arguments,
    ]),
    toolCallId: m.toolCallId,
  }));

/** Waits until the thread's chat ends with `text`, as GET /threads/:id gives it: the run has ended. */
async function ended(threadId: string, text: string) {
  for (let i = 0; i < 200; i++) {
    const chat = await messagesOf(threadId);
    if (chat.at(-1)?.content === text) return chat;
    await new Promise((later) => setTimeout(later, 100));
  }
  return messagesOf(threadId);
}

test("given a run whose answer streams, when its client drops and the thread is joined (a reload), then the join opens with RUN_STARTED, gives the chat and the answer so far at once, the rest live, and ends with RUN_FINISHED, holding the chat GET /threads/:id gives after, the answer once", async () => {
  await signIn("ana@example.com", "ana-key");
  const reload = async (earlier: Message[], answer: string) => {
    const id = await thread();
    const sent: Message[] = [...earlier];
    // An earlier turn, whole, so the chat holds more than the run's own messages.
    for (const m of earlier.filter((m) => m.role === "user")) {
      const turn = `Noted: ${String(m.content)}`;
      faux.setResponses([fauxAssistantMessage(fauxText(turn))]);
      const { seen } = await eventsOf(await post(id, [m]));
      sent.splice(sent.indexOf(m) + 1, 0, {
        id: String(
          events(seen).find((e) => e.type === "TEXT_MESSAGE_START")?.messageId,
        ),
        role: "assistant",
        content: turn,
      });
    }
    const asked = user("Tell me all of it.");
    faux.setResponses([fauxAssistantMessage(fauxText(answer))]);
    const drop = new AbortController();
    // The client goes at the third piece of the text, as a reload does.
    await eventsOf(await post(id, [...sent, asked], drop.signal), {
      until: (() => {
        let n = 0;
        return (e: Event) => e.type === "TEXT_MESSAGE_CONTENT" && ++n === 3;
      })(),
      drop,
    });
    const joinedAt = Date.now();
    const joined = await joinOf(id);
    const { seen, ended: whole } = await eventsOf(joined);
    const after = await ended(id, answer);
    const snapshot = seen.find((s) => s.event.type === "MESSAGES_SNAPSHOT");
    const finished = seen.at(-1);
    return {
      status: joined.status,
      ended: whole,
      first: seen[0]?.event.type,
      firstThread: seen[0]?.event.threadId,
      last: finished?.event.type,
      // The chat so far comes at once; the rest of the answer comes live, seconds after.
      atOnce: snapshot !== undefined && snapshot.at - joinedAt < 1_000,
      live:
        snapshot !== undefined &&
        finished !== undefined &&
        finished.at - snapshot.at > 1_000,
      // The snapshot holds the chat before the answer: the earlier turn and the user's message.
      snapshot: shown(
        ((snapshot?.event.messages as Message[] | undefined) ?? []).slice(
          0,
          sent.length + 1,
        ),
      ),
      chat: shown(chatOf([], events(seen))),
      expected: {
        snapshot: shown([...sent, asked]),
        chat: shown(after),
        threadId: id,
      },
    };
  };
  const check = async (earlier: Message[], answer: string) => {
    const got = await reload(earlier, answer);
    const { expected, ...rest } = got;
    assert.deepEqual(rest, {
      status: 200,
      ended: true,
      first: "RUN_STARTED",
      firstThread: expected.threadId,
      last: "RUN_FINISHED",
      atOnce: true,
      live: true,
      snapshot: expected.snapshot,
      chat: expected.chat,
    });
    // The answer is whole, and once.
    assert.equal(got.chat.at(-1)?.content, answer);
  };
  await check([], long("Ana"));
  await check([user("Remember the pens.")], long("pens"));
});

test("given a run with a tool round, when a second viewer joins while it goes, in the tool or in the answer's text, then the viewer who sent it, the one who joined and GET /threads/:id after hold the same chat under the same message ids", async () => {
  await signIn("ana@example.com", "ana-key");
  const twoViewers = async (item: string, joinAt: (e: Event) => boolean) => {
    const id = await thread();
    const call = `wait-${item}`;
    const answer = long(item);
    faux.setResponses([
      fauxAssistantMessage(
        [
          fauxText("Counting. "),
          fauxToolCall("till-wait", { item }, { id: call }),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage(fauxText(answer)),
    ]);
    const asked = user(`Count the ${item}.`);
    let joining: Promise<{ seen: Seen[]; ended: boolean }> | undefined;
    const sender = await eventsOf(await post(id, [asked]), {
      until: joinAt,
      then: () => {
        joining = joinOf(id).then((joined) => eventsOf(joined));
      },
    });
    const joiner = await (joining ??
      Promise.resolve({ seen: [], ended: false }));
    const after = await ended(id, answer);
    return {
      got: {
        senderEnded: sender.ended,
        joinerEnded: joiner.ended,
        joinerLast: events(joiner.seen).at(-1)?.type,
        sender: shown(chatOf([asked], events(sender.seen))),
        joiner: shown(chatOf([], events(joiner.seen))),
      },
      expected: {
        senderEnded: true,
        joinerEnded: true,
        joinerLast: "RUN_FINISHED",
        sender: shown(after),
        joiner: shown(after),
      },
      roles: after.map((m) => m.role),
    };
  };
  const inTool = await twoViewers("pens", (e) => e.type === "TOOL_CALL_END");
  const inText = await twoViewers(
    "ink",
    (() => {
      let result = false;
      return (e: Event) => {
        if (e.type === "TOOL_CALL_RESULT") result = true;
        return result && e.type === "TEXT_MESSAGE_CONTENT";
      };
    })(),
  );
  assert.deepEqual(
    { inTool: inTool.got, inText: inText.got },
    { inTool: inTool.expected, inText: inText.expected },
  );
  // GET's chat is the whole tool round, so the equality above is over each of its ids.
  assert.deepEqual(
    { inTool: inTool.roles, inText: inText.roles },
    {
      inTool: ["user", "assistant", "tool", "assistant"],
      inText: ["user", "assistant", "tool", "assistant"],
    },
  );
});

test("given a run of Bo's that goes, when Ana joins his thread, or a thread that is not there, then she gets the same answer as GET /threads/:id gives her, a 404, and Bo's run goes on to its answer", async () => {
  await signIn("bo@example.com", "bo-key");
  const bos = await thread();
  faux.setResponses([
    fauxAssistantMessage(
      [fauxToolCall("till-wait", { item: "nibs" }, { id: "wait-nibs" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(fauxText("There are 3 nibs.")),
  ]);
  // A body that does not end in time is read as that, so a join that streams Bo's run shows in the answer.
  const answered = async (response: Response) => ({
    status: response.status,
    body: await response.text().catch(() => "a body that did not end"),
  });
  let got: unknown;
  let expected: unknown;
  const { seen } = await eventsOf(await post(bos, [user("Count the nibs.")]), {
    until: (e) => e.type === "TOOL_CALL_END",
    then: async () => {
      process.env.DEV_USER_EMAIL = "ana@example.com";
      const nowhere = randomUUID();
      const limit = AbortSignal.timeout(5_000);
      got = {
        bos: await answered(await joinOf(bos, limit)),
        nowhere: await answered(await joinOf(nowhere, limit)),
      };
      expected = {
        bos: await answered(await fetch(`${base}/threads/${bos}`)),
        nowhere: await answered(await fetch(`${base}/threads/${nowhere}`)),
      };
      process.env.DEV_USER_EMAIL = "bo@example.com";
    },
  });
  assert.deepEqual(got, expected);
  assert.deepEqual(
    {
      statuses: [
        (got as { bos: { status: number } }).bos.status,
        (got as { nowhere: { status: number } }).nowhere.status,
      ],
      answered: events(seen)
        .filter((e) => e.type === "TEXT_MESSAGE_CONTENT")
        .map((e) => e.delta)
        .join(""),
    },
    { statuses: [404, 404], answered: "There are 3 nibs." },
  );
});
