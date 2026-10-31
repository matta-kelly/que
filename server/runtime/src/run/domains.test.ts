/**
 * The domains API for the signed-in user: each domain they hold, with the connectors and roles it names, and no
 * domain they do not hold. It is the read half of the Connections screen.
 *
 * On the fixture deployment "trace": its two domains are "roles-domain", which reaches the internal warehouse with
 * its reader role, and "till-domain", which reaches the till on the user's own login. A user with no grant holds no
 * domain, and a request with no identity is a 401.
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
  "trace",
);
delete process.env.DEV_USER_EMAIL;
delete process.env.DEV_USER_NAME;

const { app } = await import("../serve.js");

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

/** The domains GET /que/domains gives the user. */
const domainsFor = async (email: string) => {
  const res = await as(email, "/que/domains");
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()) as {
    name: string;
    connectors: string[];
    roles: string[];
  }[];
};

test("given one user with two domains, another with one, and another with no grant, when each reads GET /que/domains, then each gets the domains they hold with their connectors and roles, and no identity gets a 401", async () => {
  const ANA = "ana-two-domains@example.com";
  const BEN = "ben-one-domain@example.com";
  const CAL = "cal-no-domain@example.com";
  await grant(ANA, "ana", "roles-domain", "till-domain");
  await grant(BEN, "ben", "till-domain");
  await grant(CAL, "cal");

  assert.deepEqual(await domainsFor(ANA), [
    {
      name: "roles-domain",
      connectors: ["warehouse"],
      roles: ["warehouse-reader"],
    },
    { name: "till-domain", connectors: ["till"], roles: [] },
  ]);
  // The domain the user does not hold is absent, not the one they do.
  assert.deepEqual(await domainsFor(BEN), [
    { name: "till-domain", connectors: ["till"], roles: [] },
  ]);
  assert.deepEqual(await domainsFor(CAL), []);

  delete process.env.DEV_USER_EMAIL;
  const anonymous = await app.request("/que/domains");
  assert.equal(anonymous.status, 401, await anonymous.clone().text());
});
