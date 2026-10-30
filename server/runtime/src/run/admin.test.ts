/**
 * The admin API: `/que/admin/*` is for an admin alone, and reads the runtime's control plane. The deployment is the
 * fixture "roles", whose domain uses an internal connector's role. Who is asking comes from @que/identity, which reads
 * DEV_USER_EMAIL at each request; the first user it makes is an admin, and each one after a member (@que/users).
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { deploymentRoot } from "../../../tests/deployment-root.js";

const db = await PGlite.create();
const database = new PGLiteSocketServer({ db, port: 0, maxConnections: 50 });
await database.start();
process.env.DATABASE_URL = `postgresql://postgres@${database.getServerConn()}/postgres`;
process.env.QUE_DEPLOYMENT = deploymentRoot(
  join(import.meta.dirname, "../../../tests/integration/mount/fixtures"),
  "roles",
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

/** A request as the user with this email, or with no identity. */
const as = (email: string | undefined, path: string) => {
  if (email) process.env.DEV_USER_EMAIL = email;
  else delete process.env.DEV_USER_EMAIL;
  return app.request(path);
};

test("an admin reads each mounted domain, with the connectors it names and the roles it gives", async () => {
  const res = await as("admin@example.com", "/que/admin/domains");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), [
    {
      name: "roles-domain",
      connectors: ["warehouse"],
      roles: ["warehouse-reader"],
    },
  ]);
});

test("every /que/admin route answers 401 to no identity and 403 to a member", async () => {
  // The first user made is the admin; the one after is a member.
  await as("admin@example.com", "/que/admin/domains");
  assert.equal((await as(undefined, "/que/admin/domains")).status, 401);
  assert.equal((await as(undefined, "/que/admin/no-such-route")).status, 401);
  assert.equal(
    (await as("member@example.com", "/que/admin/domains")).status,
    403,
  );
  assert.equal(
    (await as("member@example.com", "/que/admin/no-such-route")).status,
    403,
  );
});
