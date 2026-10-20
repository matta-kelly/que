import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { SETUP, storeOn } from "./index.js";

process.env.QUE_CREDENTIALS_KEY = randomBytes(32).toString("base64");

const columns = async (db: PGlite) =>
  (
    await db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'credentials' ORDER BY ordinal_position",
    )
  ).rows.map((r) => r.column_name);

test("a new store makes the table with the column plugin", async () => {
  const db = new PGlite();
  const store = storeOn(db);
  await store.set("ana", "odoo", { key: "k" });
  assert.deepEqual(await columns(db), [
    "rep",
    "plugin",
    "secret",
    "updated_at",
  ]);
  assert.deepEqual((await store.get("ana", "odoo"))?.values, { key: "k" });
});

test("a store made with the old column package is renamed to plugin, and keeps its rows", async () => {
  const db = new PGlite();
  // A store as que made it before: the same table, with the column package.
  await storeOn(db).set("ana", "odoo", { key: "k" });
  await db.query("ALTER TABLE credentials RENAME COLUMN plugin TO package");
  assert.deepEqual(await columns(db), [
    "rep",
    "package",
    "secret",
    "updated_at",
  ]);

  const store = storeOn(db);
  assert.deepEqual((await store.get("ana", "odoo"))?.values, { key: "k" });
  assert.deepEqual(
    (await store.list("ana")).map((r) => r.plugin),
    ["odoo"],
  );
  assert.deepEqual(await columns(db), [
    "rep",
    "plugin",
    "secret",
    "updated_at",
  ]);
  // The key is on the new column: a second set of the same plugin replaces the row.
  await store.set("ana", "odoo", { key: "k2" });
  assert.deepEqual((await store.get("ana", "odoo"))?.values, { key: "k2" });
  assert.equal((await store.list("ana")).length, 1);
});

test("the setup runs again on a store it has set up, and changes nothing", async () => {
  const db = new PGlite();
  await storeOn(db).set("ana", "odoo", { key: "k" });
  const again = storeOn(db);
  assert.deepEqual((await again.get("ana", "odoo"))?.values, { key: "k" });
  assert.deepEqual(await columns(db), [
    "rep",
    "plugin",
    "secret",
    "updated_at",
  ]);
});

test("a setup that fails part way changes nothing: the rename is all or none", async () => {
  const db = new PGlite();
  // A table the rename cannot finish on: plugin is there beside package.
  await db.query(
    "CREATE TABLE credentials (rep text, package text, plugin text, secret text, updated_at timestamptz)",
  );
  await db.query(
    "INSERT INTO credentials (rep, package, secret) VALUES ('ana', 'odoo', 's')",
  );
  await assert.rejects(db.query(SETUP), /plugin/);
  assert.deepEqual(await columns(db), [
    "rep",
    "package",
    "plugin",
    "secret",
    "updated_at",
  ]);
  assert.deepEqual(
    (await db.query("SELECT rep, package FROM credentials")).rows,
    [{ rep: "ana", package: "odoo" }],
  );
});
