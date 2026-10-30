/**
 * An agent that loads each op on demand, on pi, through que's server listening on a port of its own: POST
 * /threads/:id/runs on the fixture deployment "prompt", whose agent "scout" (the till and alpha, on demand) runs. The
 * first request sends the on-demand prompt and offers the tools to open and load, and no op; once the model loads an
 * op, the next request offers it and the model's call runs through the door, as the signed-in user. On a database of
 * its own (PGlite, served on a local port). In the place of Fireworks, pi-ai's scripted provider (`faux`) answers under
 * Fireworks' provider id and records each request, so no model is called.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import type { Message } from "@earendil-works/pi-ai";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type FauxResponseFactory,
} from "@earendil-works/pi-ai/providers/faux";
import {
  getCurrentSystemPrompt,
  getCurrentTools,
} from "@earendil-works/pi-ai/utils/transcript";
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
const { onDemand } = await import("../assemble/on-demand/index.js");

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

type Event = { type: string; [field: string]: unknown };

/** The AG-UI events of an SSE body, each `data:` line one event. */
const eventsOf = (text: string): Event[] =>
  text
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

type Request = { prompt: string; tools: string[]; messages: Message[] };

/**
 * One message on the thread after the chat it holds, as a run in which the model makes each step's call in a turn
 * of its own, then answers "Done.": each request the run sent, and the run's events.
 */
async function run(
  threadId: string,
  content: string,
  steps: Parameters<typeof fauxToolCall>[],
) {
  const requests: Request[] = [];
  const queue = [...steps];
  const respond: FauxResponseFactory = (request) => {
    requests.push({
      prompt: getCurrentSystemPrompt(request.messages),
      tools: getCurrentTools(request.messages)
        .map((t) => t.name)
        .sort(),
      messages: [...request.messages],
    });
    const call = queue.shift();
    return call
      ? fauxAssistantMessage([fauxToolCall(...call)], {
          stopReason: "toolUse",
        })
      : fauxAssistantMessage(fauxText("Done."));
  };
  faux.setResponses(Array.from({ length: 10 }, () => respond));
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
  const events = eventsOf(await response.text());
  assert.ok(
    events.some((e) => e.type === "RUN_FINISHED"),
    events.map((e) => e.type).join(", "),
  );
  return { requests, events };
}

/** The result of the call `id` as the stream gave it, its content parsed. */
const streamed = (events: Event[], id: string) => {
  const result = events.find(
    (e) => e.type === "TOOL_CALL_RESULT" && e.toolCallId === id,
  );
  return result && (JSON.parse(String(result.content)) as unknown);
};

/** Whether the call `id` failed, as a later request gives its result to the model. */
const failedIn = (requests: Request[], id: string) =>
  requests
    .flatMap((r) => r.messages)
    .find((m) => m.role === "toolResult" && m.toolCallId === id)?.isError;

const TILL = [
  "till-count",
  "till-tally",
  "till-wait",
  "till-stall",
  "till-jam",
];
const tillOps = (r: Request | undefined) =>
  (r?.tools ?? []).filter((name) => TILL.includes(name));

test("given an on-demand agent, when a user's run loads an op and calls it, then the first request sends the on-demand prompt and offers open_plugin, load_operation and read_skill and no op, the next offers the op, and the call runs through the door as the user; a later run of the chat loads another beside it", async () => {
  as("eve@example.com", "Eve Stone");
  await connect("eve-key");
  const id = await thread("scout");

  const first = await run(id, "How many pens?", [
    [
      "load_operation",
      { plugin: "till", operation: "till-count" },
      { id: "l1" },
    ],
    ["till-count", { item: "pens" }, { id: "c1" }],
  ]);
  assert.equal(first.requests.length, 3);
  assert.equal(
    first.requests[0].prompt,
    systemPrompt({
      user: { name: "Eve Stone", email: "eve@example.com" },
      catalog: mounted.plugins
        .filter((p) => ["till", "alpha"].includes(p.definition.plugin.name))
        .map((plugin) => ({ plugin })),
      environment: onDemand.prompt,
    }),
    "the first request sent another system prompt",
  );
  assert.deepEqual(first.requests[0].tools, [
    "load_operation",
    "open_plugin",
    "read_skill",
  ]);
  assert.equal(failedIn(first.requests, "l1"), false);
  assert.deepEqual(first.requests.slice(1).map(tillOps), [
    ["till-count"],
    ["till-count"],
  ]);
  // The door ran it with Eve's connection.
  assert.deepEqual(streamed(first.events, "c1"), {
    conn: "till:eve-key",
    item: "pens",
  });

  // The next message of the chat: till-count is still offered, and till-tally joins it once loaded.
  const next = await run(id, "And tally them.", [
    [
      "load_operation",
      { plugin: "till", operation: "till-tally" },
      { id: "l2" },
    ],
    ["till-tally", { item: "pens" }, { id: "c2" }],
  ]);
  assert.deepEqual(next.requests.map(tillOps), [
    ["till-count"],
    ["till-count", "till-tally"],
    ["till-count", "till-tally"],
  ]);
  assert.deepEqual(streamed(next.events, "c2"), {
    conn: "till:eve-key",
    item: "pens",
    tallied: 3,
  });
});
