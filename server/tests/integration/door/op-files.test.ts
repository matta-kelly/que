/**
 * The op's context carries the run's thread's files: a domain op's input names a file id, and its run reads the bytes
 * through `ctx.files`, never the store's path. A run whose faux model calls the op with an attachment's id gets the
 * CSV's rows counted from its bytes; a file id from another thread is an OpFailed that names the file, and the model
 * is given it, so it can tell the user.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type { Message } from "@earendil-works/pi-ai";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  type FauxResponseFactory,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import {
  createRegistry,
  Harness,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import { storeOn as credentialStoreOn } from "@que/credentials";
import { storeOn as fileStoreOn } from "@que/files";
import type { Catalog } from "../../../runtime/src/access/catalog.js";
import { accessOn } from "../../../runtime/src/access/access.js";
import { door, type PlacedOp } from "../../../runtime/src/assemble/door.js";
import { mountDeployment } from "../../../runtime/src/mount/deployment.js";
import { loadingFor } from "../../../runtime/src/run/loading.js";
import { extension } from "../../../runtime/src/runner/pi/extension.js";
import { deploymentRoot } from "../../deployment-root.js";

process.env.QUE_CREDENTIALS_KEY = randomBytes(32).toString("base64");

const root = deploymentRoot(join(import.meta.dirname, "fixtures"), "rows");
const mounted = await mountDeployment(root);
const access = accessOn(credentialStoreOn(new PGlite()));

// Every op of every mounted plugin: what the door is built from, not the catalog.
const all: PlacedOp[] = mounted.plugins.flatMap(({ definition }) =>
  definition.ops.map((op) => ({ plugin: definition.plugin, op })),
);
const call = door(access.getConnection, all);

/** The user the run is given as. */
const ANA = "ana";
/** The thread the run is on, and another thread: a file of the second is not the run's. */
const THREAD = "T";
const OTHER = "U";

const dataDir = await mkdtemp(join(tmpdir(), "que-op-run-files-"));
const filesDb = new PGlite();
const files = fileStoreOn(filesDb, dataDir);
process.on("exit", () => rmSync(dataDir, { recursive: true, force: true }));

const csv = (...rows: string[]) =>
  Buffer.from([["name", "qty"], ...rows].join("\n") + "\n");
const orders = await files.put(THREAD, {
  name: "orders.csv",
  mimeType: "text/csv",
  bytes: csv("Ana,3", "Bo,4"),
});
const credits = await files.put(THREAD, {
  name: "credits.csv",
  mimeType: "text/csv",
  bytes: csv("Ned,1", "Ann,9", "Gil,4"),
});
const foreign = await files.put(OTHER, {
  name: "prices.csv",
  mimeType: "text/csv",
  bytes: csv("Nibs,7"),
});

// pi-ai's scripted provider makes the model's calls: no model is called.
const faux = fauxProvider({
  provider: "fireworks",
  models: [{ id: "small-model", contextWindow: 64_000 }],
});
const models = createModels();
models.setProvider(faux.provider);

/** The plugins a user can use, as the runtime reads them for a catalog. */
async function catalogFor(user: string): Promise<Catalog> {
  const reachable = await Promise.all(
    mounted.plugins.map(({ definition }) =>
      access.hasAccess(definition.plugin, user),
    ),
  );
  return mounted.plugins
    .filter((_, i) => reachable[i])
    .map((plugin) => ({ plugin }));
}

/** The tool result of the call `id`, in the messages of a request, and its text. */
const resultOf = (messages: Message[], id: string) =>
  messages.find((m) => m.role === "toolResult" && m.toolCallId === id);
const textOf = (message: Message) =>
  message.role === "toolResult"
    ? message.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("")
    : "";

/**
 * A run of the deployment's agent on `thread`, with the model's scripted `calls` and its final `answer`: the messages
 * of the run's last model request. The thread's files are the run's attachments, as the harness gives them.
 */
async function runOn(
  thread: string,
  calls: ReturnType<typeof fauxToolCall>[],
  answer: string,
): Promise<Message[]> {
  const way = loadingFor(mounted.agents[0]);
  const que = {
    ...extension(await catalogFor(ANA), call, ANA, way, false, {
      files,
      thread,
      dataDir,
    }),
    name: "que",
  };
  const registry = createRegistry();
  registry.install(que);
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry },
    context,
  );
  const remaining = [...calls];
  const last: Message[] = [];
  const respond: FauxResponseFactory = (request) => {
    const toolCall = remaining.shift();
    if (toolCall)
      return fauxAssistantMessage([toolCall], { stopReason: "toolUse" });
    last.push(...request.messages);
    return fauxAssistantMessage(fauxText(answer));
  };
  faux.setResponses([respond, respond, respond]);
  try {
    const conversation = await harness.createConversation(
      {
        ownership: { kind: "ownerless" },
        agent: {
          model: { provider: "fireworks", modelId: "small-model" },
          extensions: [que],
        },
      },
      context,
    );
    const submission = await conversation.submit(
      { type: "input", content: "How many rows does it have?" },
      context,
    );
    await submission.wait(context);
  } finally {
    await harness.close(context);
  }
  return last;
}

test("given a run whose thread has two CSV attachments, when the model calls the domain op with each file's id, then the op counts that CSV's rows from its bytes and the model gets each count", async () => {
  const last = await runOn(
    THREAD,
    [
      fauxToolCall("rows-count", { file: orders.id }, { id: "s1" }),
      fauxToolCall("rows-count", { file: credits.id }, { id: "s2" }),
    ],
    "Done.",
  );

  const first = resultOf(last, "s1");
  assert.ok(
    first?.role === "toolResult",
    "the model got the first call's answer: the run ended on the call instead",
  );
  assert.equal(first.isError, false, `the first call failed: ${textOf(first)}`);
  assert.deepEqual(JSON.parse(textOf(first)), { file: "orders.csv", rows: 2 });

  const second = resultOf(last, "s2");
  assert.ok(
    second?.role === "toolResult",
    "the model got the second call's answer: the run ended on the call instead",
  );
  assert.equal(
    second.isError,
    false,
    `the second call failed: ${textOf(second)}`,
  );
  assert.deepEqual(JSON.parse(textOf(second)), {
    file: "credits.csv",
    rows: 3,
  });
});

test("given a run on a thread and a CSV attached to another thread, when the model calls the domain op with that file's id, then the call is an OpFailed that names the file, and the model is given it so it can tell the user", async () => {
  const last = await runOn(
    THREAD,
    [fauxToolCall("rows-count", { file: foreign.id }, { id: "s1" })],
    "I could not read that file.",
  );

  const failed = resultOf(last, "s1");
  assert.ok(
    failed?.role === "toolResult",
    "the model was given the failure: the run ended on the call instead",
  );
  assert.equal(
    failed.isError,
    true,
    "a file id of another thread is a failed call",
  );
  const text = textOf(failed);
  assert.ok(
    text.includes(foreign.id),
    `expected the failure to name ${foreign.id}, got "${text}"`,
  );
  assert.equal(
    text.includes(dataDir),
    false,
    "the failure names no store path",
  );
});
