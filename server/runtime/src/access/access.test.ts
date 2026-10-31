import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import * as z from "zod";
import { definePlugin, OpFailed, cardOf } from "@mku1tra/que-plugin";
import { controlOn } from "@que/control-plane";
import { storeOn } from "@que/credentials";
import { accessOn } from "./access.js";

const KEY = randomBytes(32).toString("base64");
const OTHER_KEY = randomBytes(32).toString("base64");

process.env.QUE_CREDENTIALS_KEY = KEY;

const shop = definePlugin({
  name: "shop",
  type: "plugin",
  title: "Shop",
  description: "The shop's order system.",
  credential: z.object({ key: z.string() }),
  connect: async ({ key }) => `conn:${key}`,
  ops: [
    {
      name: "shop-open",
      type: "op",
      title: "Open",
      description: "Open the shop.",
      input: z.object({ code: z.string().describe("The shop code") }),
      run: async ({ conn }) => conn,
    },
  ],
});

const ledger = definePlugin({
  name: "ledger",
  type: "plugin",
  title: "Ledger",
  description: "The ledger's books.",
  credential: z.object({ key: z.string() }),
  connect: async ({ key }) => `conn:${key}`,
  ops: [],
});

// A domain whose op reaches the shop: the control plane's grant is what gives a user a login for the shop.
const sales = definePlugin({
  name: "sales",
  type: "plugin",
  title: "Sales",
  description: "The sales.",
  ops: [
    {
      name: "sales-sync",
      type: "op",
      title: "Sync",
      description: "Sync an order through the shop.",
      uses: ["shop-open"],
      input: z.object({ code: z.string().describe("The order code") }),
      run: async () => ({}),
    },
  ],
});

// The cards the control plane reads: `usesOps` is what readPlugin makes of the sales op's `uses`.
const cards = [
  cardOf({ definition: shop, cases: [] }),
  cardOf({ definition: ledger, cases: [] }),
  cardOf({
    definition: {
      ...sales,
      plugin: { ...sales.plugin, kind: "domain", usesOps: ["shop-open"] },
    },
    cases: [],
  }),
];

test("given a store with one record written under another key, when access asks for each plugin, then hasAccess is false for the undecryptable plugin and true for the other, and connectedPlugins still lists the undecryptable one", async () => {
  const db = new PGlite();
  process.env.QUE_CREDENTIALS_KEY = OTHER_KEY;
  await storeOn(db).set("ana", "shop", { key: "a1" });
  process.env.QUE_CREDENTIALS_KEY = KEY;
  await storeOn(db).set("ana", "ledger", { key: "l1" });
  const access = accessOn(storeOn(db), controlOn(db, cards));

  assert.equal(await access.hasAccess(shop.plugin, "ana"), false);
  assert.equal(await access.hasAccess(ledger.plugin, "ana"), true);
  assert.deepEqual([...(await access.connectedPlugins("ana")).keys()].sort(), [
    "ledger",
    "shop",
  ]);
});

test("given two users granted the domain that reaches a connector and a third not granted it, when each asks for a connection, then each granted user gets the one its own credential makes, and the third an OpFailed", async () => {
  const db = new PGlite();
  const store = storeOn(db);
  const control = controlOn(db, cards);
  await control.grant("ana", "sales", "admin");
  await control.grant("carl", "sales", "admin");
  await store.set("ana", "shop", { key: "a1" });
  await store.set("carl", "shop", { key: "c1" });
  const access = accessOn(store, control);

  assert.deepEqual(await access.getConnection(shop.plugin, undefined, "ana"), {
    conn: "conn:a1",
    login: "own",
  });
  assert.deepEqual(await access.getConnection(shop.plugin, undefined, "carl"), {
    conn: "conn:c1",
    login: "own",
  });
  await assert.rejects(
    () => access.getConnection(shop.plugin, undefined, "bo"),
    OpFailed,
  );
});
