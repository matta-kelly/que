/**
 * The agent's system prompt on pi, through que's server listening on a port of its own: POST /threads/:id/runs, and
 * the request pi-ai sends the model. On a database of its own (PGlite, served on a local port) and the fixture
 * deployment "prompt", whose two agents are eager: "clerk" uses the till and alpha (a plugin with a skill) and takes
 * the user's own instructions, "keeper" uses the till on instructions of its own. In the place of Fireworks, pi-ai's
 * scripted provider (`faux`) answers under Fireworks' provider id and records each request, so no model is called.
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
} from "@earendil-works/pi-ai/providers/faux";
import { getCurrentSystemPrompt } from "@earendil-works/pi-ai/utils/transcript";
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
const { app } = await import("../serve.js");
const { models } = await import("../runner/pi/harness.js");
const mounted = await import("../mount/mounted.js");
const { systemPrompt } = await import("../assemble/prompt.js");
const { eager } = await import("../assemble/eager/index.js");

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

/** Signs in as `email` named `name`, as @que/identity reads them, for the requests that follow. */
const as = (email: string, name: string) => {
  process.env.DEV_USER_EMAIL = email;
  process.env.DEV_USER_NAME = name;
};

const json = (method: string, body: unknown) => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** Saves the signed-in user's till key, through PUT /que/connections/till. */
const connect = async (key: string) => {
  const saved = await fetch(
    `${base}/que/connections/till`,
    json("PUT", { values: { key } }),
  );
  assert.equal(saved.status, 200, await saved.clone().text());
};

/** Sets the signed-in user's own instructions, through PATCH /que/me. */
const instruct = async (instructions: string) => {
  const set = await fetch(`${base}/que/me`, json("PATCH", { instructions }));
  assert.equal(set.status, 200, await set.clone().text());
};

/** A new thread of the signed-in user's, on the agent `agent`. */
const thread = async (agent: string) => {
  const made = await fetch(`${base}/threads`, json("POST", { agent }));
  assert.equal(made.status, 201, await made.clone().text());
  return ((await made.json()) as { id: string }).id;
};

/**
 * One message on the thread, which the model answers at once: the system prompt of each request pi-ai sent the model
 * in the run, as the request's system messages give it, replayed.
 */
async function prompts(threadId: string, content: string) {
  const sent: string[] = [];
  faux.setResponses([
    (request) => {
      sent.push(getCurrentSystemPrompt(request.messages));
      return fauxAssistantMessage(fauxText("Done."));
    },
  ]);
  const response = await fetch(
    `${base}/threads/${threadId}/runs`,
    json("POST", {
      threadId,
      runId: randomUUID(),
      messages: [{ id: randomUUID(), role: "user", content }],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
    }),
  );
  const body = await response.text();
  assert.ok(body.includes("RUN_FINISHED"), body.slice(0, 500));
  return sent;
}

/** The deployment's plugins of these names, in the order it mounts them, as the user's catalog holds them. */
const catalogOf = (names: string[]) =>
  mounted.plugins
    .filter((p) => names.includes(p.definition.plugin.name))
    .map((plugin) => ({ plugin }));

test("given an eager agent, when a user's run on it sends its first request, then the request's system prompt holds the agent's prompt word for word as assemble's prompt functions give it, and so does the first request of the next run", async () => {
  // Ana, on clerk: the default role, her name, her own instructions, and the eager way's text with the skill alpha lists.
  as("ana@example.com", "Ana Lima");
  await connect("ana-key");
  await instruct("Answer in French.");
  const anas = await thread("clerk");
  const ana = systemPrompt({
    user: {
      name: "Ana Lima",
      email: "ana@example.com",
      instructions: "Answer in French.",
    },
    catalog: catalogOf(["till", "alpha"]),
    environment: eager.prompt,
  });
  // The expected prompt holds what each part gives: the way's text, the skill and the plugin list.
  for (const part of [
    "Every operation is already a tool",
    "alpha-greet",
    "### Till (`till`)",
    "Answer in French.",
  ])
    assert.ok(ana.includes(part), `the expected prompt has no "${part}"`);

  // Bo, on keeper: the agent's own instructions in the role's place, no text of his, and the till alone.
  as("bo@example.com", "Bo Berg");
  await connect("bo-key");
  const bos = await thread("keeper");
  const bo = systemPrompt({
    user: { name: "Bo Berg", email: "bo@example.com" },
    catalog: catalogOf(["till"]),
    environment: eager.prompt,
    instructions: "You keep the till. Count before you answer.",
  });

  as("ana@example.com", "Ana Lima");
  const [anaFirst] = await prompts(anas, "How many pens?");
  const [anaNext] = await prompts(anas, "And ink?");
  as("bo@example.com", "Bo Berg");
  const [boFirst] = await prompts(bos, "How many nibs?");

  for (const [who, sent, expected] of [
    ["ana's first run", anaFirst, ana],
    ["ana's next run", anaNext, ana],
    ["bo's first run", boFirst, bo],
  ] as const)
    assert.ok(
      sent?.includes(expected),
      `${who} sent the system prompt ${JSON.stringify(sent)}, not one that holds ${JSON.stringify(expected)}`,
    );
});
