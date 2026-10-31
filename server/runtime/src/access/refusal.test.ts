/**
 * What que says when it refuses a call itself: a user with no login for the connector, and a role with no login
 * stored. The message names the connector, says what to ask for, and never names the user id. A user reached on
 * their own login is told to connect under Settings, Connections; a role is told to ask an admin, as an internal
 * row has no form.
 *
 * The wording here is the bar: a test fails when the message loses a domain, adds one that does not reach the
 * connector, names the user id, or says to connect where there is no form.
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

// The user every refusal is made for: a message that holds it is a message that leaks an id.
const user = "user-7f3a";

// Two internal connectors, each with two roles, so a role filter can be told from a connector filter.
const warehouse = definePlugin({
  name: "warehouse",
  type: "plugin",
  title: "Warehouse",
  description: "The warehouse's stock system.",
  credential: z.object({ key: z.string() }),
  connect: async ({ key }) => `conn:${key}`,
  roles: [
    {
      name: "warehouse-reader",
      type: "access-role",
      description: "Reads the stock.",
    },
    {
      name: "warehouse-admin",
      type: "access-role",
      description: "Changes the stock.",
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
      run: async () => ({}),
    },
    {
      name: "warehouse-set",
      type: "op",
      title: "Set a stock line",
      description: "Sets one stock line.",
      role: "warehouse-admin",
      input: z.object({ code: z.string().describe("The stock code") }),
      run: async () => ({}),
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
  roles: [
    {
      name: "ledger-reader",
      type: "access-role",
      description: "Reads the books.",
    },
  ],
  ops: [
    {
      name: "ledger-read",
      type: "op",
      title: "Read the books",
      description: "Reads one account.",
      role: "ledger-reader",
      input: z.object({ code: z.string().describe("The account code") }),
      run: async () => ({}),
    },
  ],
});

// Three third-party connectors, reached on the user's own login.
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
      run: async () => ({}),
    },
  ],
});

const crm = definePlugin({
  name: "crm",
  type: "plugin",
  title: "CRM",
  description: "The customer system.",
  credential: z.object({ key: z.string() }),
  connect: async ({ key }) => `conn:${key}`,
  ops: [
    {
      name: "crm-find",
      type: "op",
      title: "Find a customer",
      description: "One customer by its code.",
      input: z.object({ code: z.string().describe("The customer code") }),
      run: async () => ({}),
    },
  ],
});

const erp = definePlugin({
  name: "erp",
  type: "plugin",
  title: "ERP",
  description: "The planning system.",
  credential: z.object({ key: z.string() }),
  connect: async ({ key }) => `conn:${key}`,
  ops: [
    {
      name: "erp-find",
      type: "op",
      title: "Find a plan",
      description: "One plan by its code.",
      input: z.object({ code: z.string().describe("The plan code") }),
      run: async () => ({}),
    },
  ],
});

const hr = definePlugin({
  name: "hr",
  type: "plugin",
  title: "HR",
  description: "The people system.",
  credential: z.object({ key: z.string() }),
  connect: async ({ key }) => `conn:${key}`,
  ops: [
    {
      name: "hr-find",
      type: "op",
      title: "Find a person",
      description: "One person by their code.",
      input: z.object({ code: z.string().describe("The person's code") }),
      run: async () => ({}),
    },
  ],
});

// A domain with no ops of its own: the control plane reads its `usesOps` to find what it reaches.
const domain = (name: string, usesOps: string[]) => {
  const held = definePlugin({
    name,
    type: "plugin",
    title: name,
    description: `The ${name} domain.`,
  });
  return cardOf({
    definition: {
      ...held,
      plugin: { ...held.plugin, kind: "domain", usesOps },
    },
    cases: [],
  });
};

// Two domains name odoo, one names crm, two name warehouse with a different role each, one names ledger.
// No domain names erp or hr.
const cards = [
  cardOf({ definition: warehouse, cases: [] }),
  cardOf({ definition: ledger, cases: [] }),
  cardOf({ definition: odoo, cases: [] }),
  cardOf({ definition: crm, cases: [] }),
  cardOf({ definition: erp, cases: [] }),
  cardOf({ definition: hr, cases: [] }),
  domain("orders", ["odoo-find"]),
  domain("pim", ["odoo-find"]),
  domain("sales", ["crm-find"]),
  domain("stock", ["warehouse-get"]),
  domain("stock-admin", ["warehouse-set"]),
  domain("books", ["ledger-read"]),
];

async function setup() {
  const db = new PGlite();
  const store = storeOn(db);
  const control = controlOn(db, cards);
  return { control, access: accessOn(store, control) };
}

/** The message the call refuses with, checked to be an OpFailed that holds no user id. */
async function refusalOf(
  access: ReturnType<typeof accessOn>,
  plugin: Parameters<ReturnType<typeof accessOn>["getConnection"]>[0],
  role: string | undefined,
  expected: string,
): Promise<string> {
  let message = "";
  await assert.rejects(
    () => access.getConnection(plugin, role, user),
    (error: unknown) => {
      assert.ok(
        error instanceof OpFailed,
        `expected an OpFailed, got ${String(error)}`,
      );
      message = error.message;
      assert.equal(message, expected);
      assert.ok(
        !message.includes(user),
        `the message holds the user id: ${message}`,
      );
      return true;
    },
  );
  return message;
}

test("given a user whose grants reach no domain that names a connector, when an op without a role is called, then the OpFailed names the connector, says the user has no login with it, and names each domain that reaches it, and holds no user id", async () => {
  const { control, access } = await setup();
  // The user holds crm's domain and neither of odoo's.
  await control.grant(user, "sales", "admin");

  const forOdoo = await refusalOf(
    access,
    odoo.plugin,
    undefined,
    "you have no odoo login: ask an admin for a domain that reaches it: orders, pim",
  );
  assert.ok(
    !forOdoo.includes("sales"),
    `sales does not name odoo, so it is not offered: ${forOdoo}`,
  );

  // The other way round: now the user holds one of odoo's domains and not crm's.
  await control.revoke(user, "sales");
  await control.grant(user, "pim", "admin");

  const forCrm = await refusalOf(
    access,
    crm.plugin,
    undefined,
    "you have no crm login: ask an admin for a domain that reaches it: sales",
  );
  assert.ok(
    !forCrm.includes("pim"),
    `pim does not name crm, so it is not offered: ${forCrm}`,
  );
});

test("given a user whose grants give no op's role, when an op with a role is called, then the OpFailed names the connector and the role, and each domain that names that connector with that role, and no user id", async () => {
  const { control, access } = await setup();
  // The user holds warehouse's other role, and none of ledger's.
  await control.grant(user, "stock-admin", "admin");

  const forReader = await refusalOf(
    access,
    warehouse.plugin,
    "warehouse-reader",
    "you have no warehouse login for warehouse-reader: ask an admin for a domain that reaches it: stock",
  );
  assert.ok(
    !forReader.includes("stock-admin"),
    `stock-admin names warehouse with another role, so it is not offered: ${forReader}`,
  );
  assert.ok(
    !forReader.includes("orders") && !forReader.includes("pim"),
    `a domain that names another connector is not offered: ${forReader}`,
  );

  // A second connector and role, so no constant name passes both.
  await control.revoke(user, "stock-admin");
  await control.grant(user, "stock", "admin");

  const forLedger = await refusalOf(
    access,
    ledger.plugin,
    "ledger-reader",
    "you have no ledger login for ledger-reader: ask an admin for a domain that reaches it: books",
  );
  assert.ok(
    !forLedger.includes("stock"),
    `stock does not name ledger, so it is not offered: ${forLedger}`,
  );
});

test("given a user reached on their own login who has stored no credential, when the connector's op is called, then the OpFailed names the connector and says to connect it under Settings, Connections, and holds no user id", async () => {
  const { control, access } = await setup();
  await control.grant(user, "pim", "admin");

  await refusalOf(
    access,
    odoo.plugin,
    undefined,
    "you have no odoo login: connect it under Settings, Connections",
  );

  // A second connector, reached by a different domain, with no credential of its own.
  await control.grant(user, "sales", "admin");

  await refusalOf(
    access,
    crm.plugin,
    undefined,
    "you have no crm login: connect it under Settings, Connections",
  );
});

test("given a role with no login stored, when its op is called, then the OpFailed names the connector and the role, says to ask an admin, shows no role: rep, and never says to connect", async () => {
  const { control, access } = await setup();
  // The user reaches warehouse's role, but no credential is stored for `role:warehouse-reader`.
  await control.grant(user, "stock", "admin");

  const forReader = await refusalOf(
    access,
    warehouse.plugin,
    "warehouse-reader",
    "you have no warehouse login for warehouse-reader: ask an admin to set the role's login",
  );
  assert.ok(
    !forReader.includes("role:"),
    `the message shows no role: rep: ${forReader}`,
  );
  assert.ok(
    !/connect/i.test(forReader),
    `an internal row has no form, so the message never says to connect: ${forReader}`,
  );

  // A second role on a second connector.
  await control.revoke(user, "stock");
  await control.grant(user, "books", "admin");

  const forLedger = await refusalOf(
    access,
    ledger.plugin,
    "ledger-reader",
    "you have no ledger login for ledger-reader: ask an admin to set the role's login",
  );
  assert.ok(
    !forLedger.includes("role:"),
    `the message shows no role: rep: ${forLedger}`,
  );
  assert.ok(
    !/connect/i.test(forLedger),
    `an internal row has no form, so the message never says to connect: ${forLedger}`,
  );
});

// Two internal connectors no domain gives the op's role on, and the one domain that names `depot` without that role.
const depot = definePlugin({
  name: "depot",
  type: "plugin",
  title: "Depot",
  description: "The depot's stock.",
  credential: z.object({ key: z.string() }),
  connect: async ({ key }) => `conn:${key}`,
  roles: [
    {
      name: "depot-reader",
      type: "access-role",
      description: "Reads the depot.",
    },
    {
      name: "depot-writer",
      type: "access-role",
      description: "Changes the depot.",
    },
  ],
  ops: [
    {
      name: "depot-get",
      type: "op",
      title: "Get a depot line",
      description: "One depot line by its code.",
      role: "depot-reader",
      input: z.object({ code: z.string().describe("The depot code") }),
      run: async () => ({}),
    },
    {
      name: "depot-set",
      type: "op",
      title: "Set a depot line",
      description: "Sets one depot line.",
      role: "depot-writer",
      input: z.object({ code: z.string().describe("The depot code") }),
      run: async () => ({}),
    },
  ],
});

const payroll = definePlugin({
  name: "payroll",
  type: "plugin",
  title: "Payroll",
  description: "The payroll system.",
  credential: z.object({ key: z.string() }),
  connect: async ({ key }) => `conn:${key}`,
  roles: [
    {
      name: "payroll-runner",
      type: "access-role",
      description: "Runs the payroll.",
    },
  ],
  ops: [
    {
      name: "payroll-run",
      type: "op",
      title: "Run the payroll",
      description: "Runs one period's payroll.",
      role: "payroll-runner",
      input: z.object({ period: z.string().describe("The period") }),
      run: async () => ({}),
    },
  ],
});

const stores = domain("stores", ["depot-get"]);

test("given a user whose domains give the connector but no op's role, when the op is called, then the OpFailed names the connector and the role, says no domain gives that role, and asks an admin for a domain that does, and holds no user id", async () => {
  const db = new PGlite();
  const control = controlOn(db, [
    ...cards,
    cardOf({ definition: depot, cases: [] }),
    cardOf({ definition: payroll, cases: [] }),
    stores,
  ]);
  const access = accessOn(storeOn(db), control);
  // The user holds the only domain that names depot, and it gives depot-reader alone.
  await control.grant(user, "stores", "admin");

  // A domain names the connector, so "no domain reaches it" would be false about the connector.
  await refusalOf(
    access,
    depot.plugin,
    "depot-writer",
    "you have no depot login for depot-writer: no domain gives that role: ask an admin for a domain that gives it",
  );

  // No domain names payroll at all, so no constant connector passes both.
  await refusalOf(
    access,
    payroll.plugin,
    "payroll-runner",
    "you have no payroll login for payroll-runner: no domain gives that role: ask an admin for a domain that gives it",
  );
});

test("given a connector with no domain that names it, when its op is called, then the OpFailed names the connector and says no domain reaches it", async () => {
  const { access } = await setup();

  await refusalOf(
    access,
    erp.plugin,
    undefined,
    "you have no erp login: no domain reaches it",
  );

  await refusalOf(
    access,
    hr.plugin,
    undefined,
    "you have no hr login: no domain reaches it",
  );
});
