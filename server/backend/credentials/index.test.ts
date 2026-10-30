import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  SETUP,
  storeOn,
  type Queryable,
  type StoredCredential,
} from "./index.js";

const KEY = randomBytes(32).toString("base64");
const OTHER_KEY = randomBytes(32).toString("base64");

process.env.QUE_CREDENTIALS_KEY = KEY;

/** The lines the store writes to stderr while `run` runs. */
async function stderrDuring(run: () => Promise<void>): Promise<string[]> {
  const write = process.stderr.write;
  let said = "";
  process.stderr.write = ((chunk: string | Uint8Array) => {
    said += chunk.toString();
    return true;
  }) as typeof process.stderr.write;
  try {
    await run();
  } finally {
    process.stderr.write = write;
  }
  return said.split("\n").filter((line) => line !== "");
}

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

test("given records written under another key, when get reads them, then each gives none and says so once on stderr, naming its rep and plugin and never the values, and a record under this key still gives its values", async () => {
  const db = new PGlite();
  process.env.QUE_CREDENTIALS_KEY = OTHER_KEY;
  await storeOn(db).set("ana", "odoo", { key: "odoo-secret" });
  await storeOn(db).set("bo", "shop", { key: "shop-secret" });
  process.env.QUE_CREDENTIALS_KEY = KEY;
  await storeOn(db).set("carl", "crm", { key: "crm-secret" });
  const store = storeOn(db);

  let odoo: StoredCredential | undefined;
  let shop: StoredCredential | undefined;
  let crm: StoredCredential | undefined;
  const said = await stderrDuring(async () => {
    odoo = await store.get("ana", "odoo");
    shop = await store.get("bo", "shop");
    crm = await store.get("carl", "crm");
  });

  assert.equal(odoo, undefined);
  assert.equal(shop, undefined);
  assert.deepEqual(crm?.values, { key: "crm-secret" });
  // One line per record it could not decrypt: two records, two lines.
  assert.deepEqual(said.length, 2, `stderr: ${said.join(" | ")}`);
  assert.match(said[0], /ana/);
  assert.match(said[0], /odoo/);
  assert.match(said[1], /bo/);
  assert.match(said[1], /shop/);
  assert.doesNotMatch(said.join("\n"), /odoo-secret|shop-secret/);
});

test("given QUE_CREDENTIALS_KEY missing or not 32 bytes, when get reads a record, then it rejects and names the key", async () => {
  const db = new PGlite();
  await storeOn(db).set("ana", "odoo", { key: "k" });
  const store = storeOn(db);
  try {
    delete process.env.QUE_CREDENTIALS_KEY;
    await assert.rejects(store.get("ana", "odoo"), /QUE_CREDENTIALS_KEY/);
    process.env.QUE_CREDENTIALS_KEY = randomBytes(16).toString("base64");
    await assert.rejects(store.get("ana", "odoo"), /QUE_CREDENTIALS_KEY/);
  } finally {
    process.env.QUE_CREDENTIALS_KEY = KEY;
  }
});

test("given the database fails, when get reads a record, then it gives the database's error, not none", async () => {
  const db: Queryable = {
    async query(text) {
      if (text.includes("SELECT secret"))
        throw new Error("the database is gone");
      return { rows: [] };
    },
  };
  await assert.rejects(storeOn(db).get("ana", "odoo"), /the database is gone/);
});

test("given a record written under another key and one under this key, when list runs, then it lists both with their updatedAt, so the Connections page still shows them saved", async () => {
  const db = new PGlite();
  process.env.QUE_CREDENTIALS_KEY = OTHER_KEY;
  await storeOn(db).set("ana", "odoo", { key: "k1" });
  process.env.QUE_CREDENTIALS_KEY = KEY;
  await storeOn(db).set("ana", "shop", { key: "k2" });

  const listed = await storeOn(db).list("ana");

  assert.deepEqual(listed.map((r) => r.plugin).sort(), ["odoo", "shop"]);
  assert.ok(
    listed.every((r) => r.updatedAt instanceof Date),
    `updatedAt are dates: ${listed.map((r) => typeof r.updatedAt)}`,
  );
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
