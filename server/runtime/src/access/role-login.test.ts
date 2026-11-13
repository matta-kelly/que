/**
 * The login an op runs on, as the control plane names it: the user's own for a third-party connector, and
 * `role:<role>` for an internal one. Two users a granted domain gives the same role share that role's one
 * connection; an op whose login is none fails with an OpFailed that names the connector, and the role when it has one.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import * as z from "zod";
import { cardOf, definePlugin, OpFailed } from "@mku1tra/que-plugin";
import { controlOn } from "@que/control-plane";
import { storeOn } from "@que/credentials";
import { accessOn } from "./access.js";

process.env.QUE_CREDENTIALS_KEY = randomBytes(32).toString("base64");

/** How many times the warehouse connector's `connect` ran: a role's login opens one connection for every user. */
let connects = 0;

// Internal: each op runs with its role's login.
const warehouse = definePlugin({
  name: "warehouse",
  type: "plugin",
  title: "Warehouse",
  description: "The warehouse's stock system.",
  credential: z.object({ key: z.string() }),
  connect: async ({ key }) => {
    connects += 1;
    return `conn:${key}`;
  },
  roles: [
    {
      name: "warehouse-reader",
      type: "access-role",
      description: "Reads the stock.",
    },
  ],
  ops: [
    {
      name: "warehouse-get",
      type: "op",
      title: "Get a stock line",
      description: "One stock line by its code.",
      role: "warehouse-reader",
      input: z.object({ code: z.string().describe("The stock code") }),
      run: async ({ conn }, { code }) => ({ conn, code }),
    },
  ],
});

// Third-party: reached on the user's own login.
const odoo = definePlugin({
  name: "odoo",
  type: "plugin",
  title: "Odoo",
  description: "The Odoo order system.",
  credential: z.object({ key: z.string() }),
  connect: async ({ key }) => `conn:${key}`,
  ops: [
    {
      name: "odoo-find",
      type: "op",
      title: "Find an order",
      description: "One order by its code.",
      input: z.object({ code: z.string().describe("The order code") }),
      run: async ({ conn }, { code }) => ({ conn, code }),
    },
  ],
});

// A domain that reaches both connectors: its op calls one op of each.
const pim = definePlugin({
  name: "pim",
  type: "plugin",
  title: "PIM",
  description: "The products.",
  ops: [
    {
      name: "pim-push",
      type: "op",
      title: "Push a product",
      description: "Pushes a product through both connectors.",
      uses: ["warehouse-get", "odoo-find"],
      input: z.object({ code: z.string().describe("The product code") }),
      run: async () => ({}),
    },
  ],
});

// The cards the control plane reads: `usesOps` is what readPlugin makes of the domain op's `uses`.
const cards = [
  cardOf({ definition: warehouse }),
  cardOf({ definition: odoo }),
  cardOf({
    definition: {
      ...pim,
      plugin: {
        ...pim.plugin,
        kind: "domain",
        usesOps: ["warehouse-get", "odoo-find"],
      },
    },
  }),
];

test("given two users a granted domain gives the same role, when each asks for the internal connector's op, then both get the role's one connection, not a credential of their own", async () => {
  const db = new PGlite();
  const store = storeOn(db);
  const control = controlOn(db, cards);
  await control.grant("ana", "pim", "admin");
  await control.grant("bo", "pim", "admin");
  // Ana's own credential is not the one her role's op runs on; the role's login is one row for every user who holds it.
  await store.set("ana", "warehouse", { key: "ana-own" });
  await store.set("role:warehouse-reader", "warehouse", { key: "svc-reader" });
  connects = 0;
  const access = accessOn(store, control);

  const ana = await access.getConnection(
    warehouse.plugin,
    "warehouse-reader",
    "ana",
  );

  assert.deepEqual(ana, { conn: "conn:svc-reader", login: "warehouse-reader" });

  const bo = await access.getConnection(
    warehouse.plugin,
    "warehouse-reader",
    "bo",
  );

  assert.deepEqual(bo, { conn: "conn:svc-reader", login: "warehouse-reader" });
  assert.equal(connects, 1, "the role's login opens one connection");
});

test("given a user with a credential of their own and no granted domain that gives the op's role, when the op is asked for, then it fails with an OpFailed that names the connector and its role", async () => {
  const db = new PGlite();
  const store = storeOn(db);
  const control = controlOn(db, cards);
  // Ana's own credential would connect, but the control plane gives her no login for the role.
  await store.set("ana", "warehouse", { key: "ana-own" });
  const access = accessOn(store, control);

  await assert.rejects(
    () => access.getConnection(warehouse.plugin, "warehouse-reader", "ana"),
    (error) =>
      error instanceof OpFailed &&
      /\bwarehouse\b/.test(error.message) &&
      /\bwarehouse-reader\b/.test(error.message),
    "expected an OpFailed naming warehouse and warehouse-reader",
  );
});

test("given a user with a credential of their own and no granted domain that reaches a third-party connector, when the connector's op is asked for, then it fails with an OpFailed that names the connector", async () => {
  const db = new PGlite();
  const store = storeOn(db);
  const control = controlOn(db, cards);
  // Ana's own credential would connect, but no granted domain reaches the connector, so her login for it is none.
  await store.set("ana", "odoo", { key: "ana-own" });
  const access = accessOn(store, control);

  await assert.rejects(
    () => access.getConnection(odoo.plugin, undefined, "ana"),
    (error) =>
      error instanceof OpFailed &&
      /\bodoo\b/.test(error.message) &&
      !/role:/.test(error.message),
    "expected an OpFailed naming odoo and no role",
  );
});
