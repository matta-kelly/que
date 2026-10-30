/**
 * A deployment whose DEV_USER_INSTRUCTIONS names a file that cannot be read, through que's server listening on a port
 * of its own: a run on an agent that does not take the user's own instructions (keeper) has no need of the file, so it
 * answers, with keeper's prompt. On a database of its own (PGlite, served on a local port) and the fixture deployment
 * "prompt". In the place of Fireworks, pi-ai's scripted provider (`faux`) answers under Fireworks' provider id and
 * records each request's system prompt, so no model is called.
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
// A file the deployment's folder does not hold.
process.env.DEV_USER_INSTRUCTIONS = "no-such-instructions.md";
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

/** A new thread of the signed-in user's, on the agent `agent`. */
const thread = async (agent: string) => {
  const made = await fetch(`${base}/threads`, json("POST", { agent }));
  assert.equal(made.status, 201, await made.clone().text());
  return ((await made.json()) as { id: string }).id;
};

/** One message on the thread, which the model answers at once: the run's status, events, and each request's prompt. */
async function runOn(threadId: string, content: string) {
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
  return { status: response.status, body: await response.text(), sent };
}

const catalogOf = (names: string[]) =>
  mounted.plugins
    .filter((p) => names.includes(p.definition.plugin.name))
    .map((plugin) => ({ plugin }));

test("given DEV_USER_INSTRUCTIONS naming a file that cannot be read, when a user runs keeper, which does not take the user's instructions, then the run answers with keeper's prompt", async () => {
  for (const [email, name] of [
    ["ana@example.com", "Ana Lima"],
    ["bo@example.com", "Bo Berg"],
  ]) {
    as(email, name);
    const run = await runOn(await thread("keeper"), "Find code AB.");
    assert.equal(run.status, 200, `${name}'s run: ${run.body.slice(0, 300)}`);
    assert.ok(run.body.includes("RUN_FINISHED"), run.body.slice(0, 500));
    assert.deepEqual(run.sent, [
      systemPrompt({
        user: { name, email },
        catalog: catalogOf(["source"]),
        environment: eager.prompt,
        instructions: "You keep the till. Count before you answer.",
      }),
    ]);
  }
});
