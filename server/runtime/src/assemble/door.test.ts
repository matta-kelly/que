import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import fc from "fast-check";
import * as z from "zod";
import * as zm from "zod/mini";
import {
  cardOf,
  CARD_FORMAT,
  definePlugin,
  OpFailed,
  type Card,
} from "@mku1tra/que-plugin";
import { controlOn } from "@que/control-plane";
import { storeOn } from "@que/credentials";
import { accessOn } from "../access/access.js";
import { door, type PlacedOp } from "./door.js";

process.env.QUE_CREDENTIALS_KEY = randomBytes(32).toString("base64");

const noSuchOrder = new OpFailed("no such order");
const closed = new OpFailed("the shop is closed");
const shoppingOffline = new OpFailed("shopping is offline");
const shopClosed = new OpFailed("Shop is closed");
const alreadyVoid = new OpFailed("shop: the order was already void");
const warehouseShut = new OpFailed("the warehouse is shut");
const shelfBare = new OpFailed("stock: the shelf is bare");
const boardRefusal = new OpFailed("flow: no such board");
const bug = new Error("bug");

const shop = definePlugin({
  name: "shop",
  type: "plugin",
  title: "Shop",
  description: "The shop's order system.",
  credential: z.object({ key: z.string() }),
  connect: async ({ key }) => `conn:${key}`,
  roles: [
    {
      name: "shop-read",
      type: "access-role",
      description: "Reads orders.",
    },
  ],
  ops: [
    {
      name: "shop-get-order",
      type: "op",
      title: "Get order",
      description: "One order with its lines.",
      role: "shop-read",
      input: z.object({ id: z.number().describe("Order id") }),
      run: async ({ conn }, { id }) => {
        if (id === -1) throw noSuchOrder;
        if (id === -2) throw closed;
        if (id === 0) throw bug;
        return { id, conn };
      },
    },
    {
      name: "shop-list-orders",
      type: "op",
      title: "List orders",
      description: "The newest orders.",
      input: z.object({
        customer: z.string().describe("Customer name"),
        limit: z.number().default(10).describe("How many orders"),
      }),
      run: async (_ctx, params) => params,
    },
    {
      name: "shop-tag-orders",
      type: "op",
      title: "Tag orders",
      description: "Tags the orders named.",
      input: z.object({
        ids: z
          .string()
          .refine((s) => !s.includes(" "), "ids has no spaces")
          .transform((s) => s.split(","))
          .describe("Order ids, comma-separated"),
        // A transform that throws on text that is no JSON.
        meta: z
          .string()
          .transform((s): unknown => JSON.parse(s))
          .optional()
          .describe("Order metadata, as JSON"),
      }),
      run: async (_ctx, { ids }) => ids,
    },
    {
      name: "shop-void-order",
      type: "op",
      title: "Void order",
      description: "Voids one order.",
      input: z.object({ id: z.number().describe("Order id") }),
      run: async () => {
        // A throw that is no Error: a bug.
        throw "the till is jammed";
      },
    },
    {
      name: "shop-reopen-order",
      type: "op",
      title: "Reopen order",
      description: "Reopens one order.",
      input: z.object({ id: z.number().describe("Order id") }),
      run: async () => {
        // The plugin's own text already names the connector.
        throw alreadyVoid;
      },
    },
    {
      name: "shop-check-stock",
      type: "op",
      title: "Check stock",
      description: "Checks the shop's stock.",
      input: z.object({}),
      run: async () => {
        // A word that begins with the connector's name is not the name.
        throw shoppingOffline;
      },
    },
    {
      name: "shop-close-till",
      type: "op",
      title: "Close the till",
      description: "Closes the till.",
      input: z.object({}),
      run: async () => {
        // The connector's name in another case is still the name.
        throw shopClosed;
      },
    },
  ],
});
const getOrder: PlacedOp = { plugin: shop.plugin, op: shop.ops[0] };
const listOrders: PlacedOp = { plugin: shop.plugin, op: shop.ops[1] };
const tagOrders: PlacedOp = { plugin: shop.plugin, op: shop.ops[2] };
const voidOrder: PlacedOp = { plugin: shop.plugin, op: shop.ops[3] };
const reopenOrder: PlacedOp = { plugin: shop.plugin, op: shop.ops[4] };
const checkStock: PlacedOp = { plugin: shop.plugin, op: shop.ops[5] };
const closeTill: PlacedOp = { plugin: shop.plugin, op: shop.ops[6] };

/** Access that gives a connection named by what it was asked for. */
const named = door(async (plugin, role, user) => ({
  conn: `${plugin.name}:${role ?? "none"}:${user}`,
  login: role ?? "own",
}));

// The domain whose op reaches the shop, for the control plane: a grant of it gives ana the role the op runs with.
const orders: Card = {
  $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  name: "orders",
  description: "The orders domain.",
  extensions: {
    "io.github.matta-kelly.que": {
      format: CARD_FORMAT,
      title: "Orders",
      kind: "domain",
      ops: [],
      skills: [],
      roles: [],
      usesOps: ["shop-get-order"],
      usesSkills: [],
      capabilities: [],
    },
  },
};

test("given an op whose input has a default, when it is called without that field, then run gets the parsed params with the default in", async () => {
  assert.deepEqual(await named(listOrders, { customer: "Ana" }, "ana"), {
    customer: "Ana",
    limit: 10,
  });
  assert.deepEqual(
    await named(listOrders, { customer: "Bo", limit: 3 }, "ana"),
    { customer: "Bo", limit: 3 },
  );
});

test("given a connector op whose run throws an OpFailed, when the door calls it, then the caller gets an OpFailed that names the connector first, holds the plugin's text after it, and has the original as its cause", async () => {
  const shopError = await named(getOrder, { id: -1 }, "ana").catch(
    (error: unknown) => error,
  );
  assert.ok(
    shopError instanceof OpFailed,
    `the door gave ${String(shopError)}, which is no OpFailed`,
  );
  assert.equal(shopError.message, "shop: no such order");
  assert.equal(shopError.cause, noSuchOrder);

  const stockError = await named(replenish, { sku: "SKU-9" }, "ana").catch(
    (error: unknown) => error,
  );
  assert.ok(
    stockError instanceof OpFailed,
    `the door gave ${String(stockError)}, which is no OpFailed`,
  );
  assert.equal(stockError.message, "stock: the warehouse is shut");
  assert.equal(stockError.cause, warehouseShut);

  const alsoShop = await named(getOrder, { id: -2 }, "ana").catch(
    (error: unknown) => error,
  );
  assert.ok(
    alsoShop instanceof OpFailed,
    `the door gave ${String(alsoShop)}, which is no OpFailed`,
  );
  assert.equal(alsoShop.message, "shop: the shop is closed");
  assert.equal(alsoShop.cause, closed);
});

test("given a connector op whose OpFailed text names the connector, or only starts like its name, when the door calls it, then the caller's OpFailed names the connector once, and the original is its cause", async () => {
  const shopError = await named(reopenOrder, { id: 4 }, "ana").catch(
    (error: unknown) => error,
  );
  assert.ok(
    shopError instanceof OpFailed,
    `the door gave ${String(shopError)}, which is no OpFailed`,
  );
  assert.equal(shopError.message, "shop: the order was already void");
  assert.equal(shopError.cause, alreadyVoid);

  const stockError = await named(audit, { sku: "SKU-9" }, "ana").catch(
    (error: unknown) => error,
  );
  assert.ok(
    stockError instanceof OpFailed,
    `the door gave ${String(stockError)}, which is no OpFailed`,
  );
  assert.equal(stockError.message, "stock: the shelf is bare");
  assert.equal(stockError.cause, shelfBare);

  // A longer word that shares the connector's name as a raw prefix does not start with the name, so the text gets it.
  const shoppingError = await named(checkStock, {}, "ana").catch(
    (error: unknown) => error,
  );
  assert.ok(
    shoppingError instanceof OpFailed,
    `the door gave ${String(shoppingError)}, which is no OpFailed`,
  );
  assert.equal(shoppingError.message, "shop: shopping is offline");
  assert.equal(shoppingError.cause, shoppingOffline);

  // The connector's name in another case is the name, so the text is not named again.
  const closedAgain = await named(closeTill, {}, "ana").catch(
    (error: unknown) => error,
  );
  assert.ok(
    closedAgain instanceof OpFailed,
    `the door gave ${String(closedAgain)}, which is no OpFailed`,
  );
  assert.equal(closedAgain.message, "Shop is closed");
  assert.equal(closedAgain.cause, shopClosed);
});

test("given a user with no login, when the door calls a connector op, then C3's refusal passes as thrown with no second name, and the door names only what op.run throws", async () => {
  // C3's shape, as its own branch makes it: the connector, no login, and the domain to ask an admin for.
  const refusal = new OpFailed(
    "no shop login for bo: ask an admin for the orders domain",
  );
  const noLogin = door(async () => {
    throw refusal;
  });

  const passed = await noLogin(getOrder, { id: 4 }, "bo").catch(
    (error: unknown) => error,
  );
  assert.equal(passed, refusal, "C3's refusal is thrown on as it is");
  assert.equal(
    (passed as OpFailed).message,
    "no shop login for bo: ask an admin for the orders domain",
    "C3's refusal keeps its text, with no connector name added",
  );

  // The same wrap, for what run throws: the connector is named, so C3's text is never named twice.
  const wrapped = await named(getOrder, { id: -1 }, "ana").catch(
    (error: unknown) => error,
  );
  assert.ok(
    wrapped instanceof OpFailed,
    `the door gave ${String(wrapped)}, which is no OpFailed`,
  );
  assert.equal(wrapped.message, "shop: no such order");
  assert.equal(wrapped.cause, noSuchOrder);
});

test("given a domain op whose run throws an OpFailed, or a run that throws what is no OpFailed, when the door calls it, then the throw passes as it is, and only a connector op's OpFailed is named", async () => {
  const domainError = await named(flowBoard, {}, "ana").catch(
    (error: unknown) => error,
  );
  assert.equal(
    domainError,
    boardRefusal,
    "a domain op's OpFailed is thrown on as it is",
  );

  const bugError = await named(getOrder, { id: 0 }, "ana").catch(
    (error: unknown) => error,
  );
  assert.equal(
    bugError,
    bug,
    "an error that is no OpFailed is thrown on as it is",
  );

  // The control: the same kind of throw from a connector op is the one the door names.
  const connectorError = await named(getOrder, { id: -1 }, "ana").catch(
    (error: unknown) => error,
  );
  assert.ok(
    connectorError instanceof OpFailed,
    `the door gave ${String(connectorError)}, which is no OpFailed`,
  );
  assert.equal(connectorError.message, "shop: no such order");
  assert.equal(connectorError.cause, noSuchOrder);
});

test("given an op and a user, when it is called, then access is asked by the op's plugin and role and the user, and run gets that connection", async () => {
  const asked: unknown[][] = [];
  const call = door(async (plugin, role, user) => {
    asked.push([plugin.name, role, user]);
    return { conn: `conn-${asked.length}`, login: role ?? "own" };
  });

  assert.deepEqual(await call(getOrder, { id: 4 }, "ana"), {
    id: 4,
    conn: "conn-1",
  });
  await call(listOrders, { customer: "Bo" }, "bo");

  assert.deepEqual(asked, [
    ["shop", "shop-read", "ana"],
    ["shop", undefined, "bo"],
  ]);
});

test("given a user whose role login holds the connector credential and a user with no login, when the op is called, then the first runs on the role's login, and the second fails with an OpFailed that names the plugin", async () => {
  const db = new PGlite();
  const store = storeOn(db);
  const control = controlOn(db, [cardOf({ definition: shop }), orders]);
  await control.grant("ana", "orders", "admin");
  // Ana's own credential is not the one her role's op runs on.
  await store.set("ana", "shop", { key: "ana-own" });
  await store.set("role:shop-read", "shop", { key: "a1" });
  const call = door(accessOn(store, control).getConnection);

  assert.deepEqual(await call(getOrder, { id: 4 }, "ana"), {
    id: 4,
    conn: "conn:a1",
  });
  await assert.rejects(
    () => call(getOrder, { id: 4 }, "bo"),
    (error) => error instanceof OpFailed && /\bshop\b/.test(error.message),
  );
});

test("given arguments that break a refine, when the op is called, then the door throws an OpFailed on one line, with the path and the refine's message", async () => {
  await assert.rejects(
    () => named(tagOrders, { ids: "a b" }, "ana"),
    (error) =>
      error instanceof OpFailed &&
      /\bids\b/.test(error.message) &&
      /ids has no spaces/.test(error.message) &&
      !error.message.includes("\n"),
  );
  await assert.rejects(
    () => named(tagOrders, { ids: 7 }, "ana"),
    (error) =>
      error instanceof OpFailed &&
      /\bids\b/.test(error.message) &&
      !error.message.includes("\n"),
  );
});

test("given an argument the input does not name, when the op is called, then the door throws an OpFailed that names it", async () => {
  await assert.rejects(
    () => named(listOrders, { customer: "Ana", color: "red" }, "ana"),
    (error) => error instanceof OpFailed && /\bcolor\b/.test(error.message),
  );
  await assert.rejects(
    () => named(listOrders, { customer: "Bo", page: 2 }, "ana"),
    (error) => error instanceof OpFailed && /\bpage\b/.test(error.message),
  );
});

// Arguments of any shape: right ones, ones that break the refine or the type, extra fields, and things that are no object.
const commaIds = fc.string({ unit: fc.constantFrom("a", "b", ",", " ") });
const anyArguments = fc.oneof(
  fc.record({ ids: commaIds }),
  fc.record({ ids: commaIds, extra: fc.jsonValue() }),
  fc.record({ ids: commaIds, meta: fc.string() }),
  fc.record({ ids: commaIds, meta: fc.json() }),
  fc.record({ ids: fc.jsonValue() }),
  fc.dictionary(fc.string(), fc.jsonValue()),
  fc.anything(),
);

test("given any arguments, when an op whose input has a refine and a transform is called at the door, then it gives the op's result or throws an OpFailed, never another error", async () => {
  await fc.assert(
    fc.asyncProperty(anyArguments, async (params) => {
      const outcome = await named(tagOrders, params, "ana").then(
        (result) => ({ result }),
        (error: unknown) => ({ error }),
      );
      if ("error" in outcome)
        assert.ok(
          outcome.error instanceof OpFailed,
          `the door threw ${String(outcome.error)}, which is no OpFailed`,
        );
      else
        assert.ok(
          Array.isArray(outcome.result) &&
            outcome.result.every((id) => typeof id === "string"),
          `the door gave ${JSON.stringify(outcome.result)}, which is not the op's result`,
        );
    }),
  );
});

/** The message JSON.parse throws for this text, in this runtime. */
const parseFailure = (text: string) => {
  try {
    JSON.parse(text);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error(`${text} is JSON`);
};

test("given a transform that throws, when the op is called, then the door throws an OpFailed with the throw's message", async () => {
  await assert.rejects(
    () => named(tagOrders, { ids: "a", meta: "{" }, "ana"),
    (error) =>
      error instanceof OpFailed && error.message.includes(parseFailure("{")),
  );
  await assert.rejects(
    () => named(tagOrders, { ids: "b", meta: "[1," }, "ana"),
    (error) =>
      error instanceof OpFailed && error.message.includes(parseFailure("[1,")),
  );
});

const mini = definePlugin({
  name: "mini",
  type: "plugin",
  title: "Mini",
  description: "Orders, with inputs made with zod/mini.",
  ops: [
    {
      name: "mini-get-order",
      type: "op",
      title: "Get order",
      description: "One order.",
      input: zm.object({ id: zm.number().check(zm.describe("Order id")) }),
      run: async (_ctx, { id }) => ({ id }),
    },
  ],
});
const miniGetOrder: PlacedOp = { plugin: mini.plugin, op: mini.ops[0] };

test("given an op whose input is made with zod/mini, when it is called, then a good call gives the result and an extra field is an OpFailed that names it", async () => {
  const answer = (params: unknown) =>
    named(miniGetOrder, params, "ana").catch((error: Error) => error);

  assert.deepEqual(await answer({ id: 4 }), { id: 4 });
  assert.deepEqual(await answer({ id: 7 }), { id: 7 });
  const extra = await answer({ id: 4, color: "red" });
  assert.ok(extra instanceof OpFailed, `the door gave ${String(extra)}`);
  assert.match(extra.message, /\bcolor\b/);
});

test("given a run that throws no Error, when the op is called, then the throw comes out as it is", async () => {
  const thrown = await named(voidOrder, { id: 4 }, "ana").catch(
    (error: unknown) => error,
  );
  assert.equal(thrown, "the till is jammed");
});

const stock = definePlugin({
  name: "stock",
  type: "plugin",
  title: "Stock",
  description: "The shop's stock, checked as it is asked.",
  ops: [
    {
      name: "stock-reserve",
      type: "op",
      title: "Reserve stock",
      description: "Reserves one product.",
      input: z.object({
        sku: z
          .string()
          .refine(
            async (sku) => sku.startsWith("SKU-"),
            "the sku is no product",
          )
          .describe("Product sku"),
      }),
      run: async (_ctx, { sku }) => ({ reserved: sku }),
    },
    {
      name: "stock-replenish",
      type: "op",
      title: "Replenish stock",
      description: "Replenishes one product.",
      input: z.object({ sku: z.string().describe("Product sku") }),
      run: async () => {
        throw warehouseShut;
      },
    },
    {
      name: "stock-audit",
      type: "op",
      title: "Audit stock",
      description: "Audits the stock.",
      input: z.object({ sku: z.string().describe("Product sku") }),
      run: async () => {
        // The plugin's own text already names the connector.
        throw shelfBare;
      },
    },
  ],
});
const reserve: PlacedOp = { plugin: stock.plugin, op: stock.ops[0] };
const replenish: PlacedOp = { plugin: stock.plugin, op: stock.ops[1] };
const audit: PlacedOp = { plugin: stock.plugin, op: stock.ops[2] };

const flow = definePlugin({
  name: "flow",
  type: "plugin",
  kind: "domain",
  title: "Flow",
  description: "A domain whose ops call the shop's and stock's ops they list.",
  ops: [
    {
      name: "flow-tag-orders",
      type: "op",
      title: "Tag orders through flow",
      description: "Tags the orders the shop's op tags.",
      uses: ["shop-tag-orders"],
      // The fields the listed op names, and two it does not: the nested call refuses them.
      input: z.object({
        ids: z.string().describe("Order ids, comma-separated"),
        meta: z.string().optional().describe("Order metadata, as JSON"),
        color: z
          .string()
          .optional()
          .describe("A field the listed op does not name"),
        page: z
          .number()
          .optional()
          .describe("A field the listed op does not name"),
      }),
      run: async ({ ops }, params) => ops["shop-tag-orders"](params),
    },
    {
      name: "flow-reserve",
      type: "op",
      title: "Reserve through flow",
      description: "Reserves the product the stock op reserves.",
      uses: ["stock-reserve"],
      input: z.object({ sku: z.string().describe("Product sku") }),
      run: async ({ ops }, params) => ops["stock-reserve"](params),
    },
    {
      name: "flow-board",
      type: "op",
      title: "Open a board",
      description: "Opens one board.",
      input: z.object({}),
      run: async () => {
        throw boardRefusal;
      },
    },
  ],
});
const flowTag: PlacedOp = { plugin: flow.plugin, op: flow.ops[0] };
const flowReserve: PlacedOp = { plugin: flow.plugin, op: flow.ops[1] };
const flowBoard: PlacedOp = { plugin: flow.plugin, op: flow.ops[2] };
const through = door(
  async (plugin, role, user) => ({
    conn: `${plugin.name}:${role ?? "none"}:${user}`,
    login: role ?? "own",
  }),
  [getOrder, listOrders, tagOrders, voidOrder, reserve, flowTag, flowReserve],
);

// Arguments a domain op passes to the listed op: all that its input takes.
const nestedArguments = fc.oneof(
  fc.record({ ids: commaIds }),
  fc.record({ ids: commaIds, meta: fc.string() }),
);

test("given any arguments a domain op passes to a listed op, when the domain op is called, then it gives the listed op's result or throws an OpFailed, never another error", async () => {
  await fc.assert(
    fc.asyncProperty(nestedArguments, async (params) => {
      const outcome = await through(flowTag, params, "ana").then(
        (result) => ({ result }),
        (error: unknown) => ({ error }),
      );
      if ("error" in outcome)
        assert.ok(
          outcome.error instanceof OpFailed,
          `the door threw ${String(outcome.error)}, which is no OpFailed`,
        );
      else
        assert.ok(
          Array.isArray(outcome.result) &&
            outcome.result.every((id) => typeof id === "string"),
          `the door gave ${JSON.stringify(outcome.result)}, which is not the listed op's result`,
        );
    }),
  );
});

test("given a nested call with an extra top-level field, when the domain op is called, then the door throws an OpFailed that names the field, and never another error", async () => {
  await assert.rejects(
    () => through(flowTag, { ids: "a,b", color: "red" }, "ana"),
    (error) => error instanceof OpFailed && /\bcolor\b/.test(error.message),
  );
  await assert.rejects(
    () => through(flowTag, { ids: "a,b", page: 2 }, "ana"),
    (error) => error instanceof OpFailed && /\bpage\b/.test(error.message),
  );
});

test("given an async refine on a listed op, when a domain op calls it, then a good value gives the result and a bad one a one-line OpFailed with the refine's message", async () => {
  const answer = (params: unknown) =>
    through(flowReserve, params, "ana").catch((error: Error) => error);

  assert.deepEqual(await answer({ sku: "SKU-1" }), { reserved: "SKU-1" });
  assert.deepEqual(await answer({ sku: "SKU-22" }), { reserved: "SKU-22" });
  const refused = await answer({ sku: "chair" });
  assert.ok(refused instanceof OpFailed, `the door gave ${String(refused)}`);
  assert.match(refused.message, /the sku is no product/);
  assert.doesNotMatch(refused.message, /\n/);
});

test("given a transform that throws on a listed op, when a domain op calls it, then the door throws an OpFailed with the throw's message", async () => {
  await assert.rejects(
    () => through(flowTag, { ids: "a", meta: "{" }, "ana"),
    (error) =>
      error instanceof OpFailed && error.message.includes(parseFailure("{")),
  );
  await assert.rejects(
    () => through(flowTag, { ids: "b", meta: "[1," }, "ana"),
    (error) =>
      error instanceof OpFailed && error.message.includes(parseFailure("[1,")),
  );
});

test("given an op whose input has an async refine, when it is called, then a good value gives the result and a bad one a one-line OpFailed with the refine's message", async () => {
  const answer = (params: unknown) =>
    named(reserve, params, "ana").catch((error: Error) => error);

  assert.deepEqual(await answer({ sku: "SKU-1" }), { reserved: "SKU-1" });
  assert.deepEqual(await answer({ sku: "SKU-22" }), { reserved: "SKU-22" });
  const refused = await answer({ sku: "chair" });
  assert.ok(refused instanceof OpFailed, `the door gave ${String(refused)}`);
  assert.match(refused.message, /the sku is no product/);
  assert.doesNotMatch(refused.message, /\n/);
});

/** An op whose approval is `value`. */
const approving = (placed: PlacedOp, approval: unknown): PlacedOp =>
  ({ ...placed, op: { ...placed.op, approval } }) as PlacedOp;

/** An op flagged with `approval: true`. */
const flagged = (placed: PlacedOp): PlacedOp => approving(placed, true);

/** The calls that reached an op's run, by its name: the tests below clear it first. */
const ran: string[] = [];

const ledger = definePlugin({
  name: "ledger",
  type: "plugin",
  title: "Ledger",
  description: "The shop's ledger.",
  credential: z.object({ key: z.string() }),
  connect: async ({ key }) => `ledger:${key}`,
  ops: [
    {
      name: "ledger-commit",
      type: "op",
      title: "Commit a line",
      description: "Commits one line to the ledger.",
      input: z.object({
        line: z.string().describe("The line to commit"),
        note: z.string().default("none").describe("A note"),
      }),
      run: async (_ctx, params) => {
        ran.push("ledger-commit");
        return params;
      },
    },
  ],
});
const commit: PlacedOp = { plugin: ledger.plugin, op: ledger.ops[0] };

const audited = definePlugin({
  name: "audit",
  type: "plugin",
  kind: "domain",
  title: "Audit",
  description: "A domain that commits through the ledger.",
  ops: [
    {
      name: "audit-commit",
      type: "op",
      title: "Commit an audit line",
      description: "Commits the ledger's line.",
      uses: ["ledger-commit"],
      input: z.object({ line: z.string().describe("The line to commit") }),
      run: async ({ ops }, params) => {
        ran.push("audit-commit");
        return ops["ledger-commit"](params);
      },
    },
  ],
});
const auditCommit: PlacedOp = { plugin: audited.plugin, op: audited.ops[0] };

/** Access that gives a connection, and records that it was asked. */
const connecting =
  (asked: string[] = []) =>
  async (plugin: { name: string }, role: string | undefined) => {
    asked.push(plugin.name);
    return { conn: `${plugin.name}:${role ?? "none"}`, login: role ?? "own" };
  };

const refusal = (op: string) =>
  `${op} needs approval, and it cannot be approved over MCP: the call did not run`;

test("given an op with no flag, when the door calls it, then it runs", async () => {
  ran.length = 0;
  const call = door(connecting(), [commit]);
  assert.deepEqual(await call(commit, { line: "a" }, "ana"), {
    line: "a",
    note: "none",
  });
  assert.deepEqual(ran, ["ledger-commit"]);
});

test("given a flagged op, when the door calls it, then neither run nor connect is called, and the caller gets an OpFailed that says it needs approval and cannot be approved over MCP", async () => {
  ran.length = 0;
  const asked: string[] = [];
  const call = door(connecting(asked), [flagged(commit)]);
  await assert.rejects(
    call(flagged(commit), { line: "a" }, "ana"),
    (error: Error) =>
      error instanceof OpFailed && error.message === refusal("ledger-commit"),
  );
  assert.deepEqual(ran, []);
  assert.deepEqual(asked, []);
});

test("given a flagged op whose input breaks the parse, when the door calls it, then the caller gets the parse's OpFailed: the input is parsed first", async () => {
  const call = door(connecting(), [flagged(commit)]);
  await assert.rejects(
    call(flagged(commit), { line: 1 }, "ana"),
    (error: Error) =>
      error instanceof OpFailed &&
      /^invalid ledger-commit input/.test(error.message),
  );
});

test("given an approval whose when answers true for some args, when the door calls the op, then those calls are refused and the others run", async () => {
  ran.length = 0;
  const some = approving(commit, {
    when: async ({ line }: { line: string }) => line === "big",
  });
  const call = door(connecting(), [some]);
  assert.deepEqual(await call(some, { line: "small" }, "ana"), {
    line: "small",
    note: "none",
  });
  await assert.rejects(
    call(some, { line: "big" }, "ana"),
    (error: Error) => error.message === refusal("ledger-commit"),
  );
  assert.deepEqual(ran, ["ledger-commit"]);
});

test("given a domain op that lists a flagged op, when the door calls the domain op, then the listed op runs: a call through uses is not gated", async () => {
  ran.length = 0;
  const call = door(connecting(), [auditCommit, flagged(commit)]);
  assert.deepEqual(await call(auditCommit, { line: "a" }, "ana"), {
    line: "a",
    note: "none",
  });
  assert.deepEqual(ran, ["audit-commit", "ledger-commit"]);
});

test("given a flagged domain op, when the door calls it, then it is refused, and its listed op does not run", async () => {
  ran.length = 0;
  const call = door(connecting(), [flagged(auditCommit), commit]);
  await assert.rejects(
    call(flagged(auditCommit), { line: "a" }, "ana"),
    (error: Error) => error.message === refusal("audit-commit"),
  );
  assert.deepEqual(ran, []);
});
