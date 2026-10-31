/**
 * The connections API for the signed-in user, on the fixture deployment "tools": its one connector that needs a
 * credential is the third-party till, which only the domain "till-domain" reaches through its skill.
 *
 * A user reaches only the connectors their granted domains name: GET /que/connections lists the till for a granted
 * user and not for one with no grant, and a save of a connector the user does not reach is refused and saved nowhere.
 * A delete is not gated on reach: a credential saved before a revoke can still be removed.
 *
 * On a database of its own (PGlite, served on a local port), with the runtime's own control plane (access/control.ts)
 * to grant a domain, as a fixture test does, before the connection.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { deploymentRoot } from "../../../tests/deployment-root.js";
import { grant } from "../../../tests/integration/grants.js";

const db = await PGlite.create();
const database = new PGLiteSocketServer({ db, port: 0, maxConnections: 50 });
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
const { access } = await import("../access/connections.js");
const { control } = await import("../access/control.js");

after(async () => {
  // A connection the runtime opened at load may still be on its way: let it land before the database goes.
  await new Promise((resolve) => setTimeout(resolve, 200));
  await database.stop();
  await db.close();
});

/** A request as the user with this email. */
const as = (email: string, path: string, init?: RequestInit) => {
  process.env.DEV_USER_EMAIL = email;
  return app.request(path, init);
};

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** A user's id, read from the table, so a test can name one without the route under test. */
const idOf = async (email: string) => {
  const { rows } = await db.query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1",
    [email],
  );
  return rows[0].id;
};

/** Each plugin the user has a credential saved for, by name. */
const savedFor = async (email: string) =>
  [...(await access.connectedPlugins(await idOf(email))).keys()].sort();

/** The connection entries GET /que/connections gives the user. */
const listedFor = async (email: string) =>
  (await (await as(email, "/que/connections")).json()) as {
    name: string;
    fields: { name: string; secret: boolean }[];
    connectedAt: string | null;
  }[];

test("given one user granted till-domain and another with no grant, when each reads GET /que/connections, then the granted user gets the till with its key field, and the other user gets nothing", async () => {
  const ANA = "ana-granted@example.com";
  const BEN = "ben-ungranted@example.com";
  await grant(ANA, "ana", "till-domain");
  await grant(BEN, "ben");

  const ana = await listedFor(ANA);
  const ben = await listedFor(BEN);

  assert.deepEqual(
    ana.map((c) => c.name),
    ["till"],
  );
  assert.deepEqual(ana[0]?.fields, [{ name: "key", secret: true }]);
  assert.equal(ana[0]?.connectedAt, null);
  assert.deepEqual(ben, []);
});

test("given a user who does not reach the till, when they PUT their key to it, then the save is refused with the connector named, and nothing is saved", async () => {
  const BEN = "ben-saves-nothing@example.com";
  await grant(BEN, "ben");

  const res = await as(
    BEN,
    "/que/connections/till",
    json("PUT", { values: { key: "ben-key" } }),
  );

  assert.equal(res.status, 403, await res.clone().text());
  assert.match(await res.text(), /till/);
  assert.deepEqual(await savedFor(BEN), []);
});

test("given a credential saved before the domain that reaches it is revoked, when the user deletes it, then the delete removes it", async () => {
  const CAL = "cal-revoked@example.com";
  const id = await grant(CAL, "cal", "till-domain");

  const saved = await as(
    CAL,
    "/que/connections/till",
    json("PUT", { values: { key: "cal-key" } }),
  );
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.deepEqual(await savedFor(CAL), ["till"]);

  await control.revoke(id, "till-domain");
  const removed = await as(CAL, "/que/connections/till", {
    method: "DELETE",
  });

  assert.equal(removed.status, 200, await removed.clone().text());
  assert.deepEqual(await savedFor(CAL), []);
});

test("a malformed body on a connection's PUT is a 400, and saves nothing", async () => {
  const DEE = "dee-malformed@example.com";
  await grant(DEE, "dee", "till-domain");

  const res = await as(DEE, "/que/connections/till", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });

  assert.equal(res.status, 400, await res.clone().text());
  assert.deepEqual(await savedFor(DEE), []);
});
