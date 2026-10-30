/**
 * A domain op calls the connector op it lists, through the door, in one deployment: the connector's login is the
 * calling user's, and a user with none gets the connector's OpFailed. The catalog may be narrowed to the domain alone;
 * the door still finds the listed op among all mounted plugins. Each nested call is a span of its own, under the call
 * that made it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
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
import { assemble } from "../../../runtime/src/assemble/assemble.js";
import { door, type PlacedOp } from "../../../runtime/src/assemble/door.js";
import { mountDeployment } from "../../../runtime/src/mount/deployment.js";
import { loadingFor } from "../../../runtime/src/run/loading.js";
import { deploymentRoot } from "../../deployment-root.js";

process.env.QUE_CREDENTIALS_KEY = randomBytes(32).toString("base64");

// Every span this process makes, kept in memory.
const spans = new InMemorySpanExporter();
trace.setGlobalTracerProvider(
  new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter: spans })],
  }),
);

const mounted = await mountDeployment(
  deploymentRoot(join(import.meta.dirname, "fixtures"), "interop"),
);
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
  await assert.rejects(
    () => bound("bo")(sync, { code: "B-1" }),
    (error) =>
      error instanceof OpFailed && /\binterop-connector\b/.test(error.message),
  );
});

test("given a domain op that lists one op, when it is called, then its context holds the ops it lists, and no other", async () => {
  const result = (await bound("ana")(sync, { code: "A-2" }).catch(
    (error: unknown) => error,
  )) as { listed: string[] };

  assert.deepEqual(result.listed, ["interop-find"]);
});

test("given an agent config that narrows the catalog to the domain alone, when the domain op's tool is called, then its listed connector op runs, found among all mounted plugins", async () => {
  const agent = mounted.agents[0];
  const reachable = await catalogFor("ana");
  assert.deepEqual(
    reachable.map(({ plugin }) => plugin.definition.plugin.name).sort(),
    ["interop-connector", "interop-domain"],
  );
  const { tools } = assemble(loadingFor(agent), {
    catalog: narrow(reachable, agent.plugins ?? []),
    call: bound("ana"),
  });
  const tool = tools.find(({ name }) => name === "interop-sync")!;

  const result = await tool
    .invoke({ code: "A-3" })
    .catch((error: unknown) => error);
  assert.deepEqual(typeof result === "string" ? JSON.parse(result) : result, {
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
