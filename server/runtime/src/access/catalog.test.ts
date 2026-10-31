/**
 * The catalog on the fixture deployment "prompt": its three domains (alpha-domain, source-domain, till-domain), and
 * the connectors they reach: alpha, which needs no credential and holds no op; source, which needs none; and till,
 * whose connection is a key of the user's own. On a database of its own (PGlite, served on a local port), and the
 * control plane the runtime makes on it (access/control.ts), as a run's catalog is read.
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
const database = new PGLiteSocketServer({ db, port: 0, maxConnections: 10 });
await database.start();
process.env.DATABASE_URL = `postgresql://postgres@${database.getServerConn()}/postgres`;
process.env.QUE_CREDENTIALS_KEY = randomBytes(32).toString("base64");
process.env.QUE_DEPLOYMENT = deploymentRoot(
  join(import.meta.dirname, "../../../tests/integration/mount/fixtures"),
  "prompt",
);
delete process.env.DEV_USER_EMAIL;
delete process.env.DEV_USER_NAME;

const { access } = await import("./connections.js");
const { catalogFor } = await import("./catalog.js");
const { plugins } = await import("../mount/mounted.js");

after(async () => {
  // A connection the runtime opened at load may still be on its way: let it land before the database goes.
  await new Promise((resolve) => setTimeout(resolve, 200));
  await database.stop();
  await db.close();
});

const till = plugins.find((p) => p.definition.plugin.name === "till");
if (!till) throw new Error("the prompt deployment mounts no till");

/** The names of the plugins the user's catalog holds, sorted. */
const catalogNames = async (userId: string) =>
  (await catalogFor(userId))
    .map(({ plugin }) => plugin.definition.plugin.name)
    .sort();

test("given a user granted two domains, when the catalog is read, then it holds those domains and each connector they reach whose login resolves, and no plugin a granted domain does not name", async () => {
  const ana = await grant(
    "ana@example.com",
    "Ana Lima",
    "source-domain",
    "till-domain",
  );
  // The till's login resolves only once its key is saved; source needs none.
  await access.setCredential(till.definition.plugin, ana, { key: "ana-key" });

  assert.deepEqual(await catalogNames(ana), [
    "source",
    "source-domain",
    "till",
    "till-domain",
  ]);
});

test("given a grant of a domain whose connector needs a credential the user has not saved, when the catalog is read, then the domain is there and the connector is left out", async () => {
  const bo = await grant("bo@example.com", "Bo Berg", "till-domain");

  assert.deepEqual(await catalogNames(bo), ["till-domain"]);
});

test("given a grant of a domain that reaches its connector through a skill, when the catalog is read, then the catalog holds the domain and that connector", async () => {
  const cy = await grant("cy@example.com", "Cy Moss", "alpha-domain");

  assert.deepEqual(await catalogNames(cy), ["alpha", "alpha-domain"]);
});
