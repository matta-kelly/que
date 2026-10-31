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
const { control } = await import("../access/control.js");

after(async () => {
  // A connection the runtime opened at load may still be on its way: let it land before the database goes.
  await new Promise((resolve) => setTimeout(resolve, 200));
  await database.stop();
  await db.close();
});

/** A request as the user with this email, or with no identity. */
const as = (email: string | undefined, path: string, init?: RequestInit) => {
  if (email) process.env.DEV_USER_EMAIL = email;
  else delete process.env.DEV_USER_EMAIL;
  return app.request(path, init);
};

/** A user's id, read from the table, so a test can name one without the route under test. */
const idOf = async (email: string) => {
  const { rows } = await db.query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1",
    [email],
  );
  return rows[0].id;
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

test("an admin lists each user with the domains granted to them", async () => {
  await as("admin@example.com", "/que/admin/domains");
  await as("listed-granted@example.com", "/que/me");
  await as("listed-empty@example.com", "/que/me");
  const [adminId, grantedId] = await Promise.all([
    idOf("admin@example.com"),
    idOf("listed-granted@example.com"),
  ]);
  await control.grant(grantedId, "roles-domain", adminId);

  const res = await as("admin@example.com", "/que/admin/users");
  assert.equal(res.status, 200, await res.clone().text());
  const body = (await res.json()) as { email: string; grants?: string[] }[];
  assert.ok(
    body.every((user) => Array.isArray(user.grants)),
    "every user has a grants list",
  );
  const byEmail = new Map(body.map((user) => [user.email, user.grants]));
  assert.deepEqual(byEmail.get("listed-empty@example.com"), []);
  assert.deepEqual(byEmail.get("listed-granted@example.com"), ["roles-domain"]);
});

test("a grant and a revoke change the user's domains, and the grant records the admin", async () => {
  await as("admin@example.com", "/que/admin/domains");
  await as("granted@example.com", "/que/me");
  await as("revoked@example.com", "/que/me");
  const [adminId, grantedId, revokedId] = await Promise.all([
    idOf("admin@example.com"),
    idOf("granted@example.com"),
    idOf("revoked@example.com"),
  ]);

  for (const id of [grantedId, revokedId]) {
    const res = await as(
      "admin@example.com",
      `/que/admin/users/${id}/grants/roles-domain`,
      { method: "PUT" },
    );
    assert.equal(res.status, 200, await res.clone().text());
  }
  assert.deepEqual(await control.grantsOf(grantedId), ["roles-domain"]);
  assert.deepEqual(await control.grantsOf(revokedId), ["roles-domain"]);

  const grantedBy = async (userId: string) => {
    const { rows } = await db.query<{ granted_by: string }>(
      "SELECT granted_by FROM grants WHERE user_id = $1 AND domain = $2",
      [userId, "roles-domain"],
    );
    return rows;
  };
  assert.deepEqual(await grantedBy(grantedId), [{ granted_by: adminId }]);
  assert.deepEqual(await grantedBy(revokedId), [{ granted_by: adminId }]);

  const removed = await as(
    "admin@example.com",
    `/que/admin/users/${grantedId}/grants/roles-domain`,
    { method: "DELETE" },
  );
  assert.equal(removed.status, 200, await removed.clone().text());
  assert.deepEqual(await control.grantsOf(grantedId), []);
  assert.deepEqual(await control.grantsOf(revokedId), ["roles-domain"]);
});

test("a grant of a connector is a 400 that names it, and of a user that is not there a 404", async () => {
  await as("admin@example.com", "/que/admin/domains");
  const adminId = await idOf("admin@example.com");

  const notDomain = await as(
    "admin@example.com",
    `/que/admin/users/${adminId}/grants/warehouse`,
    { method: "PUT" },
  );
  assert.equal(notDomain.status, 400, await notDomain.clone().text());
  assert.match(await notDomain.text(), /warehouse/);

  const missing = "00000000-0000-4000-8000-000000000000";
  const noUser = await as(
    "admin@example.com",
    `/que/admin/users/${missing}/grants/roles-domain`,
    { method: "PUT" },
  );
  assert.equal(noUser.status, 404, await noUser.clone().text());
});
