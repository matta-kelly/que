/**
 * The connections API for the signed-in user, on the fixture deployment "roles": its connector that needs a
 * credential is the internal warehouse, whose ops a user runs with a role, and which only the domain "roles-domain"
 * reaches, through its reader role.
 *
 * A user reaches only the connectors their granted domains name, and an internal connector is reached as given by its
 * role: GET /que/connections lists the warehouse with the reader role and no fields, for a granted user alone, and a
 * user may not save it a credential of their own.
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
  "roles",
);
delete process.env.DEV_USER_EMAIL;
delete process.env.DEV_USER_NAME;

const { app } = await import("../serve.js");
const { access } = await import("../access/connections.js");

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
    roles?: string[];
    connectedAt: string | null;
  }[];

test("given one user granted roles-domain and another with no grant, when each reads GET /que/connections, then the granted user gets the warehouse as given by its reader role and with no fields, and the other user gets nothing", async () => {
  const ANA = "ana-roles@example.com";
  const BEN = "ben-no-roles@example.com";
  await grant(ANA, "ana", "roles-domain");
  await grant(BEN, "ben");

  const ana = await listedFor(ANA);
  const ben = await listedFor(BEN);

  assert.deepEqual(
    ana.map((c) => c.name),
    ["warehouse"],
  );
  assert.deepEqual(ana[0]?.roles, ["warehouse-reader"]);
  assert.deepEqual(ana[0]?.fields, []);
  assert.deepEqual(ben, []);
});

test("given a user granted roles-domain, when they PUT a warehouse URL of their own, then the save is refused with the connector named, and nothing is saved", async () => {
  const CAL = "cal-internal@example.com";
  await grant(CAL, "cal", "roles-domain");

  const res = await as(
    CAL,
    "/que/connections/warehouse",
    json("PUT", { values: { url: "https://warehouse.example.com" } }),
  );

  assert.equal(res.status, 403, await res.clone().text());
  assert.match(await res.text(), /warehouse/);
  assert.deepEqual(await savedFor(CAL), []);
});
