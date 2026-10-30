/**
 * A model config's effort on a run on pi, through que's server: the request pi-ai sends to Fireworks has the effort
 * of the model the run goes on as `reasoning_effort`, and none for a model with no effort.
 *
 * On a database of its own (PGlite, served on a local port) and the fixture deployment "efforts": its one agent,
 * "plain", has no plugin and runs on "small" (`fireworks:small-model`, no effort); "keen" (`fireworks:keen-model`)
 * has the effort "high", and "calm" (`fireworks:calm-model`) the effort "low". The provider is the runtime's own
 * Fireworks provider, and a `fetch` in the place of the global one answers each of its requests and keeps its body,
 * so no model is called.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { deploymentRoot } from "../../../tests/deployment-root.js";

const db = await PGlite.create();
const database = new PGLiteSocketServer({ db, port: 0, maxConnections: 100 });
await database.start();
process.env.DATABASE_URL = `postgresql://postgres@${database.getServerConn()}/postgres`;
process.env.QUE_CREDENTIALS_KEY = randomBytes(32).toString("base64");
process.env.QUE_DEPLOYMENT = deploymentRoot(
  join(import.meta.dirname, "../../../tests/integration/mount/fixtures"),
  "efforts",
);
// The provider is made with a key.
process.env.FIREWORKS_API_KEY = "none";
process.env.DEV_USER_EMAIL = "ana@example.com";
delete process.env.DEV_USER_NAME;

const { app } = await import("../serve.js");

/** The body of each request to Fireworks' Chat Completions, in the order they came. */
const sent: Record<string, unknown>[] = [];
const send = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (!String(url).startsWith("https://api.fireworks.ai/"))
    return send(url, init);
  const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
  sent.push(body);
  const chunk = (delta: object, finish: string | null) =>
    `data: ${JSON.stringify({
      id: `chatcmpl-${sent.length}`,
      object: "chat.completion.chunk",
      created: 1_791_878_400,
      model: body.model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;
  return new Response(
    chunk({ role: "assistant", content: "Hello." }, null) +
      chunk({}, "stop") +
      "data: [DONE]\n\n",
    { headers: { "content-type": "text/event-stream" } },
  );
};

after(async () => {
  globalThis.fetch = send;
  await database.stop();
  await db.close();
});

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** A thread made through POST /threads, with the model picked before it, if any. */
const make = async (model?: string) => {
  const made = await app.request(
    "/threads",
    model ? json("POST", { model }) : { method: "POST" },
  );
  assert.equal(made.status, 201, await made.clone().text());
  return ((await made.json()) as { id: string }).id;
};

/** One run on the thread; the model and the reasoning_effort of each request it sent (null: none). */
const runOn = async (thread: string) => {
  const from = sent.length;
  const ran = await app.request(
    `/threads/${thread}/runs`,
    json("POST", {
      threadId: thread,
      runId: randomUUID(),
      messages: [{ id: randomUUID(), role: "user", content: "Hi" }],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
    }),
  );
  assert.equal(ran.status, 200);
  await ran.text();
  return sent.slice(from).map((body) => ({
    model: body.model,
    reasoning_effort: Object.hasOwn(body, "reasoning_effort")
      ? body.reasoning_effort
      : null,
  }));
};

test("given a thread on a model with an effort, when it runs on pi, then Fireworks is sent the effort as reasoning_effort; on a model with none, none is sent; and a thread whose model is picked again sends the new model's", async () => {
  const keen = await make("keen");
  const calm = await make("calm");
  const plain = await make();
  const first = {
    keen: await runOn(keen),
    calm: await runOn(calm),
    plain: await runOn(plain),
  };
  // The thread on "small" has its conversation already: the next run goes on it, on the model picked.
  const picked = await app.request(
    `/threads/${plain}`,
    json("PATCH", { model: "keen" }),
  );
  assert.equal(picked.status, 200, await picked.clone().text());
  assert.deepEqual(
    { ...first, pickedKeen: await runOn(plain) },
    {
      keen: [{ model: "keen-model", reasoning_effort: "high" }],
      calm: [{ model: "calm-model", reasoning_effort: "low" }],
      // The agent's own model, which has no effort.
      plain: [{ model: "small-model", reasoning_effort: null }],
      pickedKeen: [{ model: "keen-model", reasoning_effort: "high" }],
    },
  );
});
