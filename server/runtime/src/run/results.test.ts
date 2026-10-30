/**
 * A big result to a file, through que's server listening on a port of its own and harness.ts's own Harness: a
 * conversation's files are in the deployment's data folder, QUE_DATA_DIR (a folder of the test's own here), at
 * conversations/<id>/, and not in the deployment's folder. On a database of its own (PGlite, served on a local port)
 * and the fixture deployment "big-results", whose one agent uses the plugin "till" on a loop that moves any result
 * over 10 tokens. In the place of Fireworks, pi-ai's scripted provider (`faux`) answers under Fireworks' provider id,
 * so no model is called.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
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
  "big-results",
);
const data = mkdtempSync(join(tmpdir(), "que-data-"));
process.env.QUE_DATA_DIR = data;
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
  rmSync(data, { recursive: true, force: true });
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
type Message = { id: string; role: string; content?: unknown };

/** The AG-UI events of an SSE body, each `data:` line one event. */
async function eventsOf(response: Response): Promise<Event[]> {
  return (await response.text())
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

/** A thread of Ana's, made through POST /threads. */
const thread = async () =>
  (
    (await (await fetch(`${base}/threads`, { method: "POST" })).json()) as {
      id: string;
    }
  ).id;

/** A run sent as a client sends it, with `messages`: its events, read whole. */
const run = async (threadId: string, messages: Message[]) =>
  eventsOf(
    await fetch(`${base}/threads/${threadId}/runs`, {
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
    }),
  );

/** The messages GET /threads/:id gives. */
const held = async (threadId: string) =>
  (
    (await (await fetch(`${base}/threads/${threadId}`)).json()) as {
      messages?: Message[];
    }
  ).messages ?? [];

const user = (content: string): Message => ({
  id: randomUUID(),
  role: "user",
  content,
});

/** The conversation the thread's row points at. */
const conversationOf = async (threadId: string) =>
  (
    await db.query<{ conversation: string }>(
      "SELECT conversation FROM threads WHERE id = $1",
      [threadId],
    )
  ).rows[0]?.conversation;

/** The content of the call `id`'s result, as the stream gave it. */
const resultIn = (events: Event[], id: string) =>
  String(
    events.find((e) => e.type === "TOOL_CALL_RESULT" && e.toolCallId === id)
      ?.content ?? "",
  );

/** The relative path to `large_tool_results/` a pointer names. */
const pathIn = (pointer: string) =>
  pointer.match(/(?<![\w/.])large_tool_results\/[^\s"'`)\]<>,\\]+/)?.[0];

/** Each moved file under QUE_DATA_DIR, as its path relative to it. */
const movedFiles = () =>
  existsSync(join(data, "conversations"))
    ? readdirSync(join(data, "conversations"), { recursive: true })
        .map(String)
        .filter((path) => /\/large_tool_results\/[^/]+$/.test(path))
        .map((path) => join("conversations", path))
    : [];

const textOf = (content: PiMessage["content"]) =>
  typeof content === "string"
    ? content
    : content.map((part) => (part.type === "text" ? part.text : "")).join("");

// Over the pointer's head and tail together, so a pointer that holds it whole is no pointer.
const item = "pens ".repeat(400);
const whole = JSON.stringify({ conn: "till:ana-key", item });

/** faux calls the till's count of `item` as `big`, then answers. */
const bigRound: FauxResponseStep[] = [
  fauxAssistantMessage([fauxToolCall("till-count", { item }, { id: "big" })], {
    stopReason: "toolUse",
  }),
  fauxAssistantMessage(fauxText("Counted.")),
];

test("given a loop whose result.max is 10 tokens and QUE_DATA_DIR set, when the model calls an op with a bigger result, then the result is at $QUE_DATA_DIR/conversations/<the thread's conversation>/large_tool_results/<task>.json, which the pointer names, and nothing is in the deployment's folder", async () => {
  const id = await thread();
  faux.setResponses(bigRound);
  const events = await run(id, [user("How many pens?")]);

  const conversation = await conversationOf(id);
  assert.ok(conversation, "the thread points at no conversation");
  const files = movedFiles();
  assert.equal(files.length, 1, `files moved: ${files.join(", ")}`);
  const [file] = files as [string];
  const pointer = resultIn(events, "big");
  const path = pathIn(pointer);
  assert.ok(path, `the pointer names no file: ${pointer}`);
  assert.match(path, /^large_tool_results\/[^/]+\.json$/);
  assert.equal(file, join("conversations", conversation, path));
  assert.equal(readFileSync(join(data, file), "utf8"), whole);
  assert.ok(!pointer.includes(whole), "the model got the result whole");

  const deployment = process.env.QUE_DEPLOYMENT!;
  for (const name of ["large_tool_results", ".que", "conversations"])
    assert.ok(
      !existsSync(join(deployment, name)),
      `the deployment's folder has ${name}`,
    );
});

test("given a thread whose first turn moved a result and a second exchange after it, when the client edits the second message, then the run forks and keeps its parent's folder: the pointer's path still reads, and no file is written for the fork", async () => {
  const id = await thread();
  const u1 = user("How many pens?");
  faux.setResponses(bigRound);
  await run(id, [u1]);
  const turn = await held(id);
  const parent = await conversationOf(id);
  const before = movedFiles();

  faux.setResponses([fauxAssistantMessage(fauxText("Nothing more."))]);
  await run(id, [...turn, user("Anything else?")]);

  // On the fork, the model reads the file its kept pointer names.
  let path: string | undefined;
  faux.setResponses([
    (request) => {
      const pointer = request.messages
        .flatMap((m) =>
          m.role === "toolResult" && m.toolCallId === "big"
            ? [textOf(m.content)]
            : [],
        )
        .join("");
      path = pathIn(pointer);
      return path
        ? fauxAssistantMessage(
            [
              fauxToolCall(
                "read_result",
                { path, byte_offset: 0 },
                { id: "back" },
              ),
            ],
            { stopReason: "toolUse" },
          )
        : fauxAssistantMessage(fauxText("No pointer."));
    },
    fauxAssistantMessage(fauxText("Read.")),
  ]);
  const events = await run(id, [...turn, user("And the ink?")]);

  const fork = await conversationOf(id);
  assert.notEqual(fork, parent, "the edit made no fork");
  assert.ok(path, "the fork's request holds no pointer");
  const back = resultIn(events, "back");
  assert.ok(back.includes(whole), `read_result gave: ${back}`);
  assert.deepEqual(movedFiles(), before);
});
