/**
 * pi's registry on a server that runs many conversations: each run installs its conversation's extension, and once
 * the run has ended with no live task of its conversation left, the extension is gone, so the registry does not grow
 * with each conversation run. Through que's server listening on a port of its own (POST /threads/:id/runs), on a
 * database of its own (PGlite, served on a local port) and the fixture deployment "prompt". The server's Harness and
 * its registry are read as `Harness.open` gets them. In the place of Fireworks, pi-ai's scripted provider (`faux`)
 * answers under Fireworks' provider id, so no model is called; a compaction's request waits until the test lets it go.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  type FauxResponseFactory,
} from "@earendil-works/pi-ai/providers/faux";
import { getCurrentSystemPrompt } from "@earendil-works/pi-ai/utils/transcript";
import {
  Harness,
  type ConversationId,
  type RegistryReader,
} from "@earendil-works/pi-durable";
import { deploymentRoot } from "../../../tests/deployment-root.js";

const db = await PGlite.create();
const database = new PGLiteSocketServer({ db, port: 0, maxConnections: 100 });
await database.start();
process.env.DATABASE_URL = `postgresql://postgres@${database.getServerConn()}/postgres`;
process.env.QUE_CREDENTIALS_KEY = randomBytes(32).toString("base64");
process.env.QUE_DEPLOYMENT = deploymentRoot(
  join(import.meta.dirname, "../../../tests/integration/mount/fixtures"),
  "prompt",
);
delete process.env.DEV_USER_EMAIL;
delete process.env.DEV_USER_NAME;

// The server's Harness and the registry it was opened with, as the server opens them.
let harness!: Harness;
let registry!: RegistryReader;
const open = Harness.open.bind(Harness);
Harness.open = (async (...args: Parameters<typeof open>) => {
  registry = args[1].registry;
  return (harness = await open(...args));
}) as typeof Harness.open;

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

const json = (method: string, body: unknown) => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

process.env.DEV_USER_EMAIL = "ana@example.com";
process.env.DEV_USER_NAME = "Ana Lima";

/** A new thread of the signed-in user's, on the agent `agent`. */
const thread = async (agent: string) => {
  const made = await fetch(`${base}/threads`, json("POST", { agent }));
  assert.equal(made.status, 201, await made.clone().text());
  return ((await made.json()) as { id: string }).id;
};

/** The messages GET /threads/:id gives: the chat as the client holds it. */
const held = async (threadId: string) =>
  (
    (await (await fetch(`${base}/threads/${threadId}`)).json()) as {
      messages?: unknown[];
    }
  ).messages ?? [];

/** One message on the thread after the chat it holds, as a new run on the thread's conversation, to its end. */
async function say(threadId: string, content: string) {
  const response = await fetch(
    `${base}/threads/${threadId}/runs`,
    json("POST", {
      threadId,
      runId: randomUUID(),
      messages: [
        ...(await held(threadId)),
        { id: randomUUID(), role: "user", content },
      ],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
    }),
  );
  const body = await response.text();
  assert.ok(body.includes("RUN_FINISHED"), body.slice(0, 500));
}

/** The names of que's extensions the registry holds now. */
const ques = () =>
  registry
    .snapshot()
    .installed()
    .map((e) => e.name)
    .filter((name) => name.startsWith("que."))
    .sort();

/** The conversations of the live tasks, now. */
const live = async () =>
  new Set(
    (await harness.inspect(context)).tasks.map((t) => t.record.conversationId),
  );

/** Whether the request is a compaction's. */
const summarizing = (request: Parameters<FauxResponseFactory>[0]) =>
  getCurrentSystemPrompt(request.messages).includes(
    "context summarization assistant",
  );

/** Until `holds` is true, at most five seconds. */
async function until(holds: () => Promise<boolean>, what: string) {
  for (let tries = 0; tries < 100; tries++) {
    if (await holds()) return;
    await new Promise((later) => setTimeout(later, 50));
  }
  assert.fail(`after five seconds, not ${what}`);
}

test("given several runs on several conversations, when each has ended, then the registry holds no que extension, and during each run it held the run's own", async () => {
  // What the registry held at each chat request.
  const during: string[][] = [];
  const respond: FauxResponseFactory = () => {
    during.push(ques());
    return fauxAssistantMessage(fauxText("Done."));
  };
  faux.setResponses(Array.from({ length: 20 }, () => respond));

  const threads = [
    await thread("clerk"),
    await thread("keeper"),
    await thread("clerk"),
  ];
  for (const [i, id] of threads.entries()) await say(id, `Message ${i}.`);
  // A second run on the first thread, and one more on the second.
  await say(threads[0], "Again.");
  await say(threads[1], "Again.");

  assert.equal(during.length, 5);
  // Each run's request had one que extension: its own. A run's extension is not left for the next one to see.
  assert.deepEqual(
    during.map((names) => names.length),
    [1, 1, 1, 1, 1],
  );
  assert.deepEqual(ques(), []);
});

test("given a run whose conversation still has a live task when the run ends, then its extension stays while the task is live, and the end of the conversation's next run, with no task left, removes it", async () => {
  // A compaction's request waits until `go`.
  let go!: () => void;
  const gate = new Promise<void>((open) => (go = open));
  let conversation: ConversationId | undefined;
  let compacting = false;
  const respond: FauxResponseFactory = async (request) => {
    if (summarizing(request)) {
      await gate;
      return fauxAssistantMessage(fauxText("The user sent a long message."));
    }
    // The conversation of the chat request is the one whose generation is live.
    const [id] = await live();
    conversation ??= id;
    if (compacting && id !== undefined) {
      compacting = false;
      const handle = await harness.conversation(id, context);
      await handle?.compact(undefined, context);
    }
    return fauxAssistantMessage(fauxText("Done."));
  };
  faux.setResponses(Array.from({ length: 20 }, () => respond));

  const id = await thread("clerk");
  // A short turn, then a long one: a compaction keeps the long one and has the short one to summarize. The long one
  // is over the loop's summarize.keep (0.1 of the 64,000-token window) and under its summarize.at (0.7) by faux's
  // count, so only the test's own compaction runs.
  await say(id, "Hello.");
  await say(id, `Read this. ${"pens and ink ".repeat(2_500)}`);
  compacting = true;
  await say(id, "Summarize it.");
  assert.ok(conversation !== undefined, "no chat request had a live task");
  const own = `que.${conversation}`;

  // The run has ended; its conversation's compaction is still live, so its extension stays.
  assert.ok(
    (await live()).has(conversation),
    "the compaction is not live once the run has ended",
  );
  assert.deepEqual(ques(), [own]);

  // The compaction ends; the next run on the conversation ends with no task left, and its extension goes.
  go();
  await until(
    async () => !(await live()).has(conversation!),
    "the compaction ended",
  );
  await say(id, "Thanks.");
  await until(
    async () => !(await live()).has(conversation!),
    "the conversation's tasks ended",
  );
  assert.deepEqual(ques(), []);
});
