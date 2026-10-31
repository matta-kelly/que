/**
 * The users store: one row per person. `setRole` changes the role of a user who is
 * already there, admin or member, and the table holds it. The store talks to Postgres
 * through a pool, so this test serves a PGlite over its socket, as the runtime does.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createUsers } from "./index.js";

const db = await PGlite.create();
const database = new PGLiteSocketServer({ db, port: 0, maxConnections: 10 });
await database.start();
const users = createUsers(
  `postgresql://postgres@${database.getServerConn()}/postgres`,
);

after(async () => {
  // A connection the store opened may still be on its way: let it land before the database goes.
  await new Promise((resolve) => setTimeout(resolve, 200));
  await database.stop();
  await db.close();
});

/** The role the table holds for this user, which no method of the store sits in front of. */
const roleInTable = async (id: string) => {
  const { rows } = await db.query<{ role: string }>(
    "SELECT role FROM users WHERE id = $1",
    [id],
  );
  return rows[0].role;
};

test("setRole makes a member an admin, and an admin a member, and the table holds it", async () => {
  // The first user made is an admin, and each one after is a member.
  const ana = await users.ensure({ email: "ana@example.com", name: "Ana" });
  const bo = await users.ensure({ email: "bo@example.com", name: "Bo" });
  assert.equal(ana.role, "admin");
  assert.equal(bo.role, "member");

  await users.setRole(bo.id, "admin");
  assert.equal((await users.get(bo.id))?.role, "admin");
  assert.equal(await roleInTable(bo.id), "admin");

  await users.setRole(ana.id, "member");
  assert.equal((await users.get(ana.id))?.role, "member");
  assert.equal(await roleInTable(ana.id), "member");
});
