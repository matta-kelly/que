/**
 * A tool call on pi, through que's server listening on a port of its own: POST /threads/:id/runs, where the model
 * calls an op of the agent's plugin. On a database of its own (PGlite, served on a local port) and the fixture
 * deployment "tools", whose one agent uses the plugin "till": its op `till-count` gives back the connection the door
 * asked access for, and each user's connection names their own key. In the place of Fireworks, pi-ai's scripted
 * provider (`faux`) answers under Fireworks' provider id, so no model is called.
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

type Event = { type: string; [field: string]: unknown };

/** The AG-UI events of an SSE body, each `data:` line one event. */
async function eventsOf(response: Response): Promise<Event[]> {
  const text = await response.text();
  return text
    .split("\n\n")
    .map((frame) =>
      frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n"),
    )
    .filter(Boolean)
    .map((data) => JSON.parse(data) as Event);
}

/** Signs in as `email`, as @que/identity reads it, for the requests that follow. */
const as = (email: string) => (process.env.DEV_USER_EMAIL = email);

/** The signed-in user's id, as GET /que/me gives it. */
const me = async () =>
  ((await (await fetch(`${base}/que/me`)).json()) as { id: string }).id;

/** Saves the signed-in user's till key, through PUT /que/connections/till. */
const connect = async (key: string) => {
  const saved = await fetch(`${base}/que/connections/till`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values: { key } }),
  });
  assert.equal(saved.status, 200, await saved.clone().text());
};

/**
 * A message on a new thread of the signed-in user, in which the model calls `till-count` for `item` under the call id
 * `id` and then answers "Done.": the events streamed back.
 */
async function countRun(item: string, id: string) {
  const made = await fetch(`${base}/threads`, { method: "POST" });
  const threadId = ((await made.json()) as { id: string }).id;
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("till-count", { item }, { id })], {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage(fauxText("Done.")),
  ]);
  const response = await fetch(`${base}/threads/${threadId}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      threadId,
      runId: randomUUID(),
      messages: [
        { id: randomUUID(), role: "user", content: `How many ${item}?` },
      ],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
    }),
  });
  return eventsOf(response);
}

/** What the stream shows of the call `id`, and how the run's events go, each run of one type given once. */
const shown = (events: Event[], id: string) => {
  const own = events.filter((e) => e.toolCallId === id);
  const start = own.find((e) => e.type === "TOOL_CALL_START");
  const result = own.find((e) => e.type === "TOOL_CALL_RESULT");
  const args = own
    .filter((e) => e.type === "TOOL_CALL_ARGS")
    .map((e) => e.delta)
    .join("");
  return {
    name: start?.toolCallName,
    args: args ? (JSON.parse(args) as unknown) : undefined,
    result: result && {
      messageId: result.messageId,
      content: JSON.parse(String(result.content)) as unknown,
    },
    order: events
      .map((e) => e.type)
      .filter((type, i, types) => type !== types[i - 1]),
  };
};

test("given two signed-in users, each with a till key of their own, when faux calls the agent's op on each one's thread, then the door runs it as that user, and the stream shows the call and its result before the answer", async () => {
  as("ana@example.com");
  const ana = await me();
  await connect("ana-key");
  as("bo@example.com");
  const bo = await me();
  await connect("bo-key");
  // Two users, two ids.
  assert.notEqual(ana, bo);

  as("ana@example.com");
  const anaRun = await countRun("pens", "call-ana");
  as("bo@example.com");
  const boRun = await countRun("ink", "call-bo");

  const order = [
    "RUN_STARTED",
    "TOOL_CALL_START",
    "TOOL_CALL_ARGS",
    "TOOL_CALL_END",
    "TOOL_CALL_RESULT",
    "TEXT_MESSAGE_START",
    "TEXT_MESSAGE_CONTENT",
    "TEXT_MESSAGE_END",
    "RUN_FINISHED",
  ];
  assert.deepEqual(
    { ana: shown(anaRun, "call-ana"), bo: shown(boRun, "call-bo") },
    {
      ana: {
        name: "till-count",
        args: { item: "pens" },
        // The op got Ana's connection: the door asked access for it as her.
        result: {
          messageId: "call-ana",
          content: { conn: "till:ana-key", item: "pens" },
        },
        order,
      },
      bo: {
        name: "till-count",
        args: { item: "ink" },
        result: {
          messageId: "call-bo",
          content: { conn: "till:bo-key", item: "ink" },
        },
        order,
      },
    },
  );
});
