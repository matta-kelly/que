/**
 * A domain op calls the connector op it lists, through the door, in one deployment: the connector's login is the
 * calling user's, and a user with none gets the connector's OpFailed. The catalog may be narrowed to the domain alone;
 * the door still finds the listed op among all mounted plugins, when the model calls the domain op's tool through pi.
 * Each nested call is a span of its own, under the call that made it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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
import { trace } from "@opentelemetry/api";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from "@opentelemetry/sdk-trace";
import { OpFailed } from "@mku1tra/que-plugin";
import { storeOn } from "@que/credentials";
import type { Catalog } from "../../../runtime/src/access/catalog.js";
import { accessOn } from "../../../runtime/src/access/access.js";
import { narrow } from "../../../runtime/src/access/narrow.js";
import { door, type PlacedOp } from "../../../runtime/src/assemble/door.js";
import { mountDeployment } from "../../../runtime/src/mount/deployment.js";
import { loadingFor } from "../../../runtime/src/run/loading.js";
import { extension } from "../../../runtime/src/runner/pi/extension.js";
import { deploymentRoot } from "../../deployment-root.js";

process.env.QUE_CREDENTIALS_KEY = randomBytes(32).toString("base64");

// Every span this process makes, kept in memory.
const spans = new InMemorySpanExporter();
trace.setGlobalTracerProvider(
  new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter: spans })],
  }),
);

const root = deploymentRoot(join(import.meta.dirname, "fixtures"), "interop");
const mounted = await mountDeployment(root);
// The record the fixture's domain op makes, from the copy the mount imported.
const { listedCallFailures } = (await import(
  pathToFileURL(
    join(root, "plugins/interop-domain/io.github.matta-kelly.que/index.ts"),
  ).href
)) as { listedCallFailures: unknown[] };
const store = storeOn(new PGlite());
const access = accessOn(store);
const connector = mounted.plugins.find(
  ({ definition }) => definition.plugin.name === "interop-connector",
)!.definition.plugin;
await access.setCredential(connector, "ana", { key: "ana-key" });

// Every op of every mounted plugin: what the door is built from, not the catalog.
const all: PlacedOp[] = mounted.plugins.flatMap(({ definition }) =>
  definition.ops.map((op) => ({ plugin: definition.plugin, op })),
);
const call = door(access.getConnection, all);
const bound = (user: string) => (op: PlacedOp, params: unknown) =>
  call(op, params, user);
const sync = all.find(({ op }) => op.name === "interop-sync")!;

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

test("given a user with the connector's login, when the domain op is called, then the connector op runs through the door with that login, and the domain op gets its answer", async () => {
  const result = await bound("ana")(sync, { code: "A-1" }).catch(
    (error: unknown) => error,
  );

  assert.deepEqual(result, {
    answer: { conn: "interop:ana-key", code: "A-1" },
    listed: ["interop-find"],
  });
});

test("given a user with no login for the connector, when the domain op is called, then the call fails with the OpFailed that names the connector, and the domain op gets it", async () => {
  listedCallFailures.length = 0;
  const failed = await bound("bo")(sync, { code: "B-1" }).catch(
    (error: unknown) => error,
  );

  const [recorded] = listedCallFailures;
  assert.ok(
    recorded instanceof OpFailed &&
      /\binterop-connector\b/.test(recorded.message),
    `expected the domain op to record an OpFailed naming interop-connector, got ${String(recorded)}`,
  );
  assert.equal(
    recorded,
    failed,
    "the call rejects with the OpFailed its listed call threw",
  );
  assert.ok(
    failed instanceof OpFailed && /\binterop-connector\b/.test(failed.message),
    `expected an OpFailed naming interop-connector, got ${String(failed)}`,
  );
});

test("given a domain op that lists one op, when it is called, then its context holds the ops it lists, and no other", async () => {
  const result = (await bound("ana")(sync, { code: "A-2" }).catch(
    (error: unknown) => error,
  )) as { listed: string[] };

  assert.deepEqual(result.listed, ["interop-find"]);
});

// pi-ai's scripted provider makes the model's calls: no model is called.
const faux = fauxProvider({
  provider: "fireworks",
  models: [{ id: "small-model", contextWindow: 64_000 }],
});
const models = createModels();
models.setProvider(faux.provider);

test("given an agent config that narrows the catalog to the domain alone, when the domain op's tool is called, then its listed connector op runs, found among all mounted plugins", async () => {
  const agent = mounted.agents[0];
  const reachable = await catalogFor("ana");
  assert.deepEqual(
    reachable.map(({ plugin }) => plugin.definition.plugin.name).sort(),
    ["interop-connector", "interop-domain"],
  );
  const way = loadingFor(agent);
  const que = {
    ...extension(narrow(reachable, agent.plugins ?? []), call, "ana", way),
    name: "que",
  };
  const registry = createRegistry();
  registry.install(que);
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry },
    context,
  );

  // The model loads the domain op when the agent's way holds it back, calls its tool, then answers.
  const steps = [
    ...(way.deferred
      ? [
          fauxToolCall("load_operation", {
            plugin: "interop-domain",
            operation: "interop-sync",
          }),
        ]
      : []),
    fauxToolCall("interop-sync", { code: "A-3" }, { id: "s1" }),
  ];
  const last: Message[] = [];
  const respond: FauxResponseFactory = (request) => {
    const step = steps.shift();
    if (step) return fauxAssistantMessage([step], { stopReason: "toolUse" });
    last.push(...request.messages);
    return fauxAssistantMessage(fauxText("Done."));
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
      { type: "input", content: "Sync A-3." },
      context,
    );
    await submission.wait(context);
  } finally {
    await harness.close(context);
  }

  const result = last.find(
    (m) => m.role === "toolResult" && m.toolCallId === "s1",
  );
  assert.ok(
    result?.role === "toolResult",
    "the model got the domain op's result",
  );
  assert.equal(result.isError, false);
  const text = result.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
  assert.deepEqual(JSON.parse(text), {
    answer: { conn: "interop:ana-key", code: "A-3" },
    listed: ["interop-find"],
  });
});

test("given a domain op that calls a listed op, when the call ends, then the nested call opened its own span, under the span of the call that made it", async () => {
  spans.reset();

  await bound("ana")(sync, { code: "S-1" }).catch(() => undefined);

  const finished = spans.getFinishedSpans();
  assert.deepEqual(
    finished.map((span) => span.name),
    ["interop-find", "interop-sync"],
  );
  const [nested, outer] = finished;
  assert.equal(nested.parentSpanContext?.spanId, outer.spanContext().spanId);
});
