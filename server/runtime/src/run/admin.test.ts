/**
 * The admin API: `/que/admin/*` is for an admin alone, and reads the runtime's control plane. The deployment is the
 * fixture "roles", whose domain uses an internal connector's role. Who is asking comes from @que/identity, which reads
 * DEV_USER_EMAIL at each request; the first user it makes is an admin, and each one after a member (@que/users).
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { deploymentRoot } from "../../../tests/deployment-root.js";

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
const { control } = await import("../access/control.js");
const { access } = await import("../access/connections.js");

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

/** The role the table holds for this user. */
const roleOf = async (id: string) => {
  const { rows } = await db.query<{ role: string }>(
    "SELECT role FROM users WHERE id = $1",
    [id],
  );
  return rows[0].role;
};

/** A PATCH of a user's role, as the admin. */
const patchRole = (id: string, role: string) =>
  as("admin@example.com", `/que/admin/users/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role }),
  });

// K8's routes, as these tests fix them: `PUT /que/admin/logins/:connector/:role` takes `{ values }`, as
// `PUT /que/connections/:plugin` does; `GET /que/admin/logins` gives one `{ connector, role, set }` per role of each
// internal connector, never a value; `DELETE` removes one.
const loginPath = (connector: string, role: string) =>
  `/que/admin/logins/${connector}/${role}`;

const putLogin = (connector: string, role: string, values: unknown) =>
  as("admin@example.com", loginPath(connector, role), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values }),
  });

const deleteLogin = (connector: string, role: string) =>
  as("admin@example.com", loginPath(connector, role), { method: "DELETE" });

/** Each role of each internal connector, and whether its login is set, as GET gives it. */
const logins = async () => {
  await as("admin@example.com", "/que/me"); // the first user made is the admin
  const res = await as("admin@example.com", "/que/admin/logins");
  assert.equal(res.status, 200, await res.clone().text());
  const entries = (await res.json()) as {
    connector: string;
    role: string;
    set: boolean;
  }[];
  return new Map(entries.map((e) => [`${e.connector}:${e.role}`, e.set]));
};

/** The credential rows this connector has, by rep: what the store saved, and under what. */
const loginRows = async (plugin: string) => {
  const { rows } = await db.query<{ rep: string; plugin: string }>(
    "SELECT rep, plugin FROM credentials WHERE plugin = $1 ORDER BY rep",
    [plugin],
  );
  return rows;
};

// A login one test leaves is not another's setup: each test that reads the store starts from none.
const clearLogins = async () => {
  await access.connectedPlugins("role:cleanup"); // waits for the store's table
  await db.query("DELETE FROM credentials WHERE rep LIKE 'role:%'");
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
  // The logins routes are admin API routes: the gate covers them too.
  assert.equal((await as(undefined, "/que/admin/logins")).status, 401);
  assert.equal(
    (
      await as(undefined, loginPath("warehouse", "warehouse-reader"), {
        method: "PUT",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await as(undefined, loginPath("warehouse", "warehouse-reader"), {
        method: "DELETE",
      })
    ).status,
    401,
  );
  assert.equal(
    (await as("member@example.com", "/que/admin/logins")).status,
    403,
  );
  assert.equal(
    (
      await as(
        "member@example.com",
        loginPath("warehouse", "warehouse-reader"),
        {
          method: "PUT",
        },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await as(
        "member@example.com",
        loginPath("warehouse", "warehouse-reader"),
        {
          method: "DELETE",
        },
      )
    ).status,
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

test("a grant to a user id that is no uuid is a 404, never a 500", async () => {
  await as("admin@example.com", "/que/admin/domains");
  const res = await as(
    "admin@example.com",
    "/que/admin/users/not-a-uuid/grants/roles-domain",
    { method: "PUT" },
  );
  assert.equal(res.status, 404, await res.clone().text());
});

test("an admin sets a user's role, and the users table holds it", async () => {
  await as("admin@example.com", "/que/me");
  await as("promoted@example.com", "/que/me");
  const promotedId = await idOf("promoted@example.com");
  assert.equal(await roleOf(promotedId), "member");

  const patch = (id: string, role: string) =>
    as("admin@example.com", `/que/admin/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });

  const promoted = await patch(promotedId, "admin");
  assert.equal(promoted.status, 200, await promoted.clone().text());
  assert.equal(await roleOf(promotedId), "admin");

  const demoted = await patch(promotedId, "member");
  assert.equal(demoted.status, 200, await demoted.clone().text());
  assert.equal(await roleOf(promotedId), "member");
});

test("an admin's own PATCH that would take their admin role is refused, and saves nothing", async () => {
  await as("admin@example.com", "/que/me");
  const adminId = await idOf("admin@example.com");

  const res = await as("admin@example.com", `/que/admin/users/${adminId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "member" }),
  });
  assert.equal(res.status, 409, await res.clone().text());
  assert.equal(await roleOf(adminId), "admin");
});

test("a PATCH for a user that is not there is a 404, and writes no role", async () => {
  await as("admin@example.com", "/que/me");
  const missing = "00000000-0000-4000-8000-000000000000";

  const res = await patchRole(missing, "admin");
  assert.equal(res.status, 404, await res.clone().text());

  const { rows } = await db.query("SELECT id FROM users WHERE id = $1", [
    missing,
  ]);
  assert.deepEqual(rows, [], "the route made no user for that id");
});

test("a PATCH for a user id that is no uuid is a 404, never a 500", async () => {
  await as("admin@example.com", "/que/me");

  const res = await patchRole("not-a-uuid", "admin");
  assert.equal(res.status, 404, await res.clone().text());
});

test("a PATCH with a role that is neither admin nor member is a 400, and the role stays", async () => {
  await as("admin@example.com", "/que/me");
  await as("unchanged@example.com", "/que/me");
  const unchangedId = await idOf("unchanged@example.com");
  assert.equal(await roleOf(unchangedId), "member");

  const owner = await patchRole(unchangedId, "owner");
  assert.equal(owner.status, 400, await owner.clone().text());
  assert.equal(await roleOf(unchangedId), "member");

  const superuser = await patchRole(unchangedId, "superuser");
  assert.equal(superuser.status, 400, await superuser.clone().text());
  assert.equal(await roleOf(unchangedId), "member");
});

test("an admin sets a role's login, and the store keeps it under role:<role>, not on the admin", async () => {
  await clearLogins();
  await as("admin@example.com", "/que/me");
  const adminId = await idOf("admin@example.com");

  const res = await putLogin("warehouse", "warehouse-reader", {
    url: "https://warehouse.example/reader",
  });
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(await loginRows("warehouse"), [
    { rep: "role:warehouse-reader", plugin: "warehouse" },
  ]);

  const { rows } = await db.query<{ rep: string }>(
    "SELECT rep FROM credentials WHERE rep = $1",
    [adminId],
  );
  assert.deepEqual(rows, [], "the login was not saved on the admin's own id");
});

test("each role of a connector gets its own login, under its own rep", async () => {
  await clearLogins();
  await as("admin@example.com", "/que/me");

  const reader = await putLogin("warehouse", "warehouse-reader", {
    url: "https://warehouse.example/reader",
  });
  assert.equal(reader.status, 200, await reader.clone().text());
  const writer = await putLogin("warehouse", "warehouse-writer", {
    url: "https://warehouse.example/writer",
  });
  assert.equal(writer.status, 200, await writer.clone().text());

  assert.deepEqual(await loginRows("warehouse"), [
    { rep: "role:warehouse-reader", plugin: "warehouse" },
    { rep: "role:warehouse-writer", plugin: "warehouse" },
  ]);
});

test("a login the connector's schema refuses is a 400 that names the field, and is not saved", async () => {
  await clearLogins();
  await as("admin@example.com", "/que/me");

  const missing = await putLogin("warehouse", "warehouse-reader", {});
  assert.equal(missing.status, 400, await missing.clone().text());
  assert.match(await missing.text(), /url/);

  const wrong = await putLogin("warehouse", "warehouse-writer", { url: 42 });
  assert.equal(wrong.status, 400, await wrong.clone().text());
  assert.match(await wrong.text(), /url/);

  assert.deepEqual(await loginRows("warehouse"), []);
});

test("a role the connector does not list is a 404 that names it, and saves nothing", async () => {
  await clearLogins();
  await as("admin@example.com", "/que/me");

  const unknown = await putLogin("warehouse", "warehouse-owner", {
    url: "https://warehouse.example/owner",
  });
  assert.equal(unknown.status, 404, await unknown.clone().text());
  assert.match(await unknown.text(), /warehouse-owner/);

  const cased = await putLogin("warehouse", "Warehouse-Reader", {
    url: "https://warehouse.example/reader",
  });
  assert.equal(cased.status, 404, await cased.clone().text());
  assert.match(await cased.text(), /Warehouse-Reader/);

  assert.deepEqual(await loginRows("warehouse"), []);
});

test("a connector that is not internal is a 404 that names it, and saves nothing", async () => {
  await as("admin@example.com", "/que/me");

  const archive = await putLogin("archive", "archive-reader", {
    token: "some-key",
  });
  assert.equal(archive.status, 404, await archive.clone().text());
  assert.match(await archive.text(), /archive/);

  const domain = await putLogin("roles-domain", "warehouse-reader", {
    url: "https://warehouse.example/reader",
  });
  assert.equal(domain.status, 404, await domain.clone().text());
  assert.match(await domain.text(), /roles-domain/);

  assert.deepEqual(await loginRows("archive"), []);
});

test("a connector that is not mounted is a 404 that names it, and saves nothing", async () => {
  await as("admin@example.com", "/que/me");

  const unmounted = await putLogin("till", "till-reader", { key: "some-key" });
  assert.equal(unmounted.status, 404, await unmounted.clone().text());
  assert.match(await unmounted.text(), /till/);

  const unknown = await putLogin("no-such-connector", "reader", {
    url: "https://nowhere.example",
  });
  assert.equal(unknown.status, 404, await unknown.clone().text());
  assert.match(await unknown.text(), /no-such-connector/);

  assert.deepEqual(await loginRows("till"), []);
});

test("a login whose connect fails is a 502 that names the connector, and is not saved", async () => {
  await clearLogins();
  await as("admin@example.com", "/que/me");

  const res = await putLogin("flaky", "flaky-reader", {
    url: "https://flaky.example",
  });
  assert.equal(res.status, 502, await res.clone().text());
  assert.match(await res.text(), /flaky/);

  assert.deepEqual(await loginRows("flaky"), []);
});

test("a DELETE removes a role's login", async () => {
  await clearLogins();
  await as("admin@example.com", "/que/me");
  const set = await putLogin("warehouse", "warehouse-writer", {
    url: "https://warehouse.example/writer",
  });
  assert.equal(set.status, 200, await set.clone().text());

  const res = await deleteLogin("warehouse", "warehouse-writer");
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(await loginRows("warehouse"), []);
});

test("a DELETE of a role with no login removes nothing, and answers as one that has", async () => {
  await clearLogins();
  await as("admin@example.com", "/que/me");

  const warehouse = await deleteLogin("warehouse", "warehouse-writer");
  assert.equal(warehouse.status, 200, await warehouse.clone().text());
  const flaky = await deleteLogin("flaky", "flaky-reader");
  assert.equal(flaky.status, 200, await flaky.clone().text());

  assert.deepEqual(await loginRows("warehouse"), []);
  assert.deepEqual(await loginRows("flaky"), []);
});

test("GET lists each role of each internal connector with whether its login is set, and no other connector", async () => {
  await clearLogins();

  const entries = await logins();
  assert.deepEqual(Object.fromEntries(entries), {
    "flaky:flaky-reader": false,
    "warehouse:warehouse-reader": false,
    "warehouse:warehouse-writer": false,
  });
});

test("a login set for one role does not mark the other role's as set", async () => {
  await clearLogins();
  const before = await logins();
  assert.equal(before.get("warehouse:warehouse-writer"), false);

  const res = await putLogin("warehouse", "warehouse-reader", {
    url: "https://warehouse.example/reader",
  });
  assert.equal(res.status, 200, await res.clone().text());

  const after = await logins();
  assert.equal(after.get("warehouse:warehouse-reader"), true);
  assert.equal(after.get("warehouse:warehouse-writer"), false);
});

test("GET never gives a login's value, not even right after a PUT", async () => {
  await clearLogins();
  await as("admin@example.com", "/que/me");
  const readerUrl = "https://warehouse.example/reader-9f3";
  const writerUrl = "https://warehouse.example/writer-4c1";
  const reader = await putLogin("warehouse", "warehouse-reader", {
    url: readerUrl,
  });
  assert.equal(reader.status, 200, await reader.clone().text());
  const writer = await putLogin("warehouse", "warehouse-writer", {
    url: writerUrl,
  });
  assert.equal(writer.status, 200, await writer.clone().text());

  const res = await as("admin@example.com", "/que/admin/logins");
  assert.equal(res.status, 200, await res.clone().text());
  const text = await res.text();
  assert.ok(
    !text.includes(readerUrl),
    `GET gave the reader login's value: ${text}`,
  );
  assert.ok(
    !text.includes(writerUrl),
    `GET gave the writer login's value: ${text}`,
  );
  assert.ok(!/secret/i.test(text), `GET gave a secret: ${text}`);
});
