/**
 * The eval runner's run of one case, end to end through que's server on pi:
 * the runner's own client (evals/src/que.ts) against que's server listening on
 * a port of its own. On a database of its own (PGlite, served on a local port)
 * and the fixture deployment "tools", whose one agent "clerk" uses the plugin
 * "till". In the place of Fireworks, pi-ai's scripted provider (`faux`)
 * answers under Fireworks' provider id, so no model is called.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
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
import { que, type Message } from "../../../evals/src/que.js";
import { deploymentRoot } from "../../deployment-root.js";

const db = await PGlite.create();
const database = new PGLiteSocketServer({ db, port: 0, maxConnections: 100 });
await database.start();
process.env.DATABASE_URL = `postgresql://postgres@${database.getServerConn()}/postgres`;
process.env.QUE_CREDENTIALS_KEY = randomBytes(32).toString("base64");
process.env.QUE_DEPLOYMENT = deploymentRoot(
  join(import.meta.dirname, "../mount/fixtures"),
  "tools",
);
delete process.env.DEV_USER_NAME;
process.env.DEV_USER_EMAIL = "ana@example.com";
const { app } = await import("../../../runtime/src/serve.js");
const { models } = await import("../../../runtime/src/runner/pi/harness.js");

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

// The signed-in user's till key, which the op's result names.
const saved = await fetch(`${base}/que/connections/till`, {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ values: { key: "ana-key" } }),
});
assert.equal(saved.status, 200, await saved.clone().text());

/** What a run gave back: its messages, or the message of its fault. */
const outcome = (run: Promise<Message[]>) =>
  run.then(
    (messages) => ({ messages }),
    (error: unknown) => ({
      error: error instanceof Error ? error.message : String(error),
    }),
  );

test("given que's server on pi, when the runner runs a case under the deployment's agent, then it gives back the run's messages, the agent's answer last, as it reads them from the replay", async () => {
  faux.setResponses([
    fauxAssistantMessage(
      [fauxToolCall("till-count", { item: "pens" }, { id: "call-pens" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(fauxText("The till counts the pens.")),
  ]);
  const counted = await outcome(que(base).run("How many pens?", "clerk"));

  // Another case, with no tool: what comes back is the run's, not a constant.
  faux.setResponses([fauxAssistantMessage(fauxText("Hello, Ana."))]);
  const greeted = await outcome(que(base).run("Hi", "clerk"));

  assert.deepEqual(
    { counted, greeted },
    {
      counted: {
        messages: [
          { from: "user", text: "How many pens?", calls: [] },
          {
            from: "agent",
            text: "",
            calls: [{ name: "till-count", args: { item: "pens" } }],
          },
          {
            from: "tool",
            tool: "till-count",
            text: '{"conn":"till:ana-key","item":"pens"}',
            calls: [],
          },
          { from: "agent", text: "The till counts the pens.", calls: [] },
        ],
      },
      greeted: {
        messages: [
          { from: "user", text: "Hi", calls: [] },
          { from: "agent", text: "Hello, Ana.", calls: [] },
        ],
      },
    },
  );
});
