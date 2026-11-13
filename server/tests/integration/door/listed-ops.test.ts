/**
 * A domain op calls the connector op it lists, through the door, in one deployment: the connector's login is the
 * calling user's, and a user with none gets the connector's OpFailed. The door finds the listed op among all mounted
 * plugins.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { OpFailed } from "@mku1tra/que-plugin";
import { controlOn } from "@que/control-plane";
import { storeOn } from "@que/credentials";
import { accessOn } from "../../../runtime/src/access/access.js";
import { door, type PlacedOp } from "../../../runtime/src/assemble/door.js";
import { mountDeployment } from "../../../runtime/src/mount/deployment.js";
import { deploymentRoot } from "../../deployment-root.js";

process.env.QUE_CREDENTIALS_KEY = randomBytes(32).toString("base64");

const root = deploymentRoot(join(import.meta.dirname, "fixtures"), "interop");
const mounted = await mountDeployment(root);
// The record the fixture's domain op makes, from the copy the mount imported.
const { listedCallFailures } = (await import(
  pathToFileURL(
    join(root, "plugins/interop-domain/io.github.matta-kelly.que/index.ts"),
  ).href
)) as { listedCallFailures: unknown[] };
const db = new PGlite();
const store = storeOn(db);
const control = controlOn(
  db,
  mounted.plugins.map(({ card }) => card),
);
await control.grant("ana", "interop-domain", "admin");
const access = accessOn(store, control);
const connector = mounted.plugins.find(
  ({ definition }) => definition.plugin.name === "interop-connector",
)!.definition.plugin;
await access.setCredential(connector, "ana", { key: "ana-key" });
// Bo has a credential of his own, but no granted domain reaches the connector: his login for it is none.
await access.setCredential(connector, "bo", { key: "bo-key" });

// Every op of every mounted plugin: what the door is built from, not the catalog.
const all: PlacedOp[] = mounted.plugins.flatMap(({ definition }) =>
  definition.ops.map((op) => ({ plugin: definition.plugin, op })),
);
const call = door(access.getConnection, all);
const bound = (user: string) => (op: PlacedOp, params: unknown) =>
  call(op, params, user);
const sync = all.find(({ op }) => op.name === "interop-sync")!;

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
