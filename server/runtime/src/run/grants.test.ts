/**
 * A run's catalog on grants, through que's server listening on a port of its own (POST /threads/:id/runs), on a
 * database of its own (PGlite, served on a local port) and the fixture deployment "prompt": "keeper" names source,
 * which needs no credential; "clerk" names the till, whose connection is a key of the user's own, and alpha, which
 * holds no op. In the place of Fireworks, pi-ai's scripted provider (`faux`) answers under Fireworks' provider id and
 * records the tools and the system prompt of each request, so no model is called.
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
import {
  getCurrentSystemPrompt,
  getCurrentTools,
} from "@earendil-works/pi-ai/utils/transcript";
import { deploymentRoot } from "../../../tests/deployment-root.js";
import { grant } from "../../../tests/integration/grants.js";

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
const { control } = await import("../access/control.js");

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

/** Signs in as `email` named `name` for the requests that follow. */
const as = (email: string, name: string) => {
  process.env.DEV_USER_EMAIL = email;
  process.env.DEV_USER_NAME = name;
};

/** Saves the signed-in user's till key, through PUT /que/connections/till. */
const connect = async (key: string) => {
  const saved = await fetch(
    `${base}/que/connections/till`,
    json("PUT", { values: { key } }),
  );
  assert.equal(saved.status, 200, await saved.clone().text());
};

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

/** What one run's model request held: the tools it was offered, and its system prompt. */
type Sent = { tools: string[]; prompt: string };

/** One message on the thread after the chat it holds, as a new run, to its end, and its one model request. */
async function run(threadId: string, content: string): Promise<Sent> {
  const sent: Sent[] = [];
  faux.setResponses([
    (request) => {
      sent.push({
        tools: getCurrentTools(request.messages)
          .map((t) => t.name)
          .sort(),
        prompt: getCurrentSystemPrompt(request.messages),
      });
      return fauxAssistantMessage(fauxText("Done."));
    },
  ]);
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
  assert.equal(sent.length, 1, "the run made another number of model requests");
  return sent[0];
}

test("given a user with no grant, when a run is made, then it has no op of the domain, and after a grant the next run has them, and after a revoke the next run has none", async () => {
  as("ana@example.com", "Ana Lima");
  // Ana has no grant when her first run goes.
  const id = await thread("keeper");

  const before = await run(id, "Before the grant.");
  const ana = await grant("ana@example.com", "Ana Lima", "source-domain");
  const granted = await run(id, "After the grant.");
  await control.revoke(ana, "source-domain");
  const revoked = await run(id, "After the revoke.");

  assert.deepEqual(
    {
      before: before.tools.includes("source-find"),
      granted: granted.tools.includes("source-find"),
      revoked: revoked.tools.includes("source-find"),
    },
    { before: false, granted: true, revoked: false },
  );
});

test("given two users each signed in with a different grant, when each runs the same agent, then each run holds only the connectors its own domains name", async () => {
  // Ana's till key is saved while a grant reaches the till, then that grant is revoked: the key stays saved, and no
  // domain of hers names the till.
  as("ana@example.com", "Ana Lima");
  const ana = await grant("ana@example.com", "Ana Lima", "till-domain");
  await connect("ana-key");
  await control.revoke(ana, "till-domain");
  await grant("ana@example.com", "Ana Lima", "alpha-domain");
  const anas = await thread("clerk");

  // Bo is granted the till's domain, and no domain names alpha.
  as("bo@example.com", "Bo Berg");
  await grant("bo@example.com", "Bo Berg", "till-domain");
  await connect("bo-key");
  const bos = await thread("clerk");

  as("ana@example.com", "Ana Lima");
  const anasRun = await run(anas, "Ana's question.");
  as("bo@example.com", "Bo Berg");
  const bosRun = await run(bos, "Bo's question.");

  assert.deepEqual(
    {
      ana: {
        till: anasRun.tools.includes("till-count"),
        alpha: anasRun.prompt.includes("alpha-greet"),
      },
      bo: {
        till: bosRun.tools.includes("till-count"),
        alpha: bosRun.prompt.includes("alpha-greet"),
      },
    },
    {
      ana: { till: false, alpha: true },
      bo: { till: true, alpha: false },
    },
  );
});
