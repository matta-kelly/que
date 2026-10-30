import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from "@opentelemetry/sdk-trace";
import fc from "fast-check";
import * as z from "zod";
import * as zm from "zod/mini";
import { definePlugin, OpFailed } from "@mku1tra/que-plugin";
import { storeOn } from "@que/credentials";
import { storeOn as fileStoreOn } from "@que/files";
import { accessOn } from "../access/access.js";
import { door, type PlacedOp } from "./door.js";

process.env.QUE_CREDENTIALS_KEY = randomBytes(32).toString("base64");

// Every span this process makes, kept in memory.
const spans = new InMemorySpanExporter();
trace.setGlobalTracerProvider(
  new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter: spans })],
  }),
);

const noSuchOrder = new OpFailed("no such order");
const closed = new OpFailed("the shop is closed");
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
  ],
});
const getOrder: PlacedOp = { plugin: shop.plugin, op: shop.ops[0] };
const listOrders: PlacedOp = { plugin: shop.plugin, op: shop.ops[1] };
const tagOrders: PlacedOp = { plugin: shop.plugin, op: shop.ops[2] };
const voidOrder: PlacedOp = { plugin: shop.plugin, op: shop.ops[3] };

/** Access that gives a connection named by what it was asked for. */
const named = door(
  async (plugin, role, user) => `${plugin.name}:${role ?? "none"}:${user}`,
);

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

test("given a run that throws an OpFailed, when the op is called, then the door throws that same OpFailed", async () => {
  await assert.rejects(
    () => named(getOrder, { id: -1 }, "ana"),
    (error) => error === noSuchOrder,
  );
  await assert.rejects(
    () => named(getOrder, { id: -2 }, "ana"),
    (error) => error === closed,
  );
});

test("given an op and a user, when it is called, then access is asked by the op's plugin and role and the user, and run gets that connection", async () => {
  const asked: unknown[][] = [];
  const call = door(async (plugin, role, user) => {
    asked.push([plugin.name, role, user]);
    return `conn-${asked.length}`;
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

test("given a user with no credential for the op's plugin, when the op is called, then it fails with an OpFailed that names the plugin", async () => {
  const store = storeOn(new PGlite());
  await store.set("ana", "shop", { key: "a1" });
  const call = door(accessOn(store).getConnection);

  assert.deepEqual(await call(getOrder, { id: 4 }, "ana"), {
    id: 4,
    conn: "conn:a1",
  });
  await assert.rejects(
    () => call(getOrder, { id: 4 }, "bo"),
    (error) => error instanceof OpFailed && /\bshop\b/.test(error.message),
  );
});

test("given three calls, when each one ends, then each opened one span, named by its op", async () => {
  spans.reset();

  await named(getOrder, { id: 4 }, "ana");
  await named(listOrders, { customer: "Ana" }, "ana");
  await named(getOrder, { id: -1 }, "ana").catch(() => undefined);

  assert.deepEqual(
    spans.getFinishedSpans().map((span) => span.name),
    ["shop-get-order", "shop-list-orders", "shop-get-order"],
  );
});

test("given a run that throws, when the call ends, then its span has status ERROR and the exception recorded as an event; a call that succeeds has neither", async () => {
  spans.reset();

  await named(getOrder, { id: 4 }, "ana");
  await named(getOrder, { id: -1 }, "ana").catch(() => undefined);
  await named(getOrder, { id: 0 }, "ana").catch(() => undefined);

  const [answered, failed, broken] = spans.getFinishedSpans();
  assert.notEqual(answered.status.code, SpanStatusCode.ERROR);
  assert.deepEqual(
    answered.events.filter((event) => event.name === "exception"),
    [],
  );
  assert.equal(failed.status.code, SpanStatusCode.ERROR);
  assert.deepEqual(
    failed.events.map((event) => [
      event.name,
      event.attributes?.["exception.type"],
      event.attributes?.["exception.message"],
    ]),
    [["exception", "OpFailed", "no such order"]],
  );
  assert.equal(broken.status.code, SpanStatusCode.ERROR);
  assert.deepEqual(
    broken.events.map((event) => [
      event.name,
      event.attributes?.["exception.type"],
      event.attributes?.["exception.message"],
    ]),
    [["exception", "Error", "bug"]],
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

test("given a run that throws no Error, when the op is called, then the throw comes out as it is, and its span has status ERROR and the throw recorded", async () => {
  spans.reset();

  const thrown = await named(voidOrder, { id: 4 }, "ana").catch(
    (error: unknown) => error,
  );

  assert.equal(thrown, "the till is jammed");
  const [span] = spans.getFinishedSpans();
  assert.equal(span.status.code, SpanStatusCode.ERROR);
  assert.deepEqual(
    span.events.map((event) => [
      event.name,
      event.attributes?.["exception.message"],
    ]),
    [["exception", "the till is jammed"]],
  );
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
  ],
});
const reserve: PlacedOp = { plugin: stock.plugin, op: stock.ops[0] };

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
  ],
});
const flowTag: PlacedOp = { plugin: flow.plugin, op: flow.ops[0] };
const flowReserve: PlacedOp = { plugin: flow.plugin, op: flow.ops[1] };
const through = door(
  async (plugin, role, user) => `${plugin.name}:${role ?? "none"}:${user}`,
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

/**
 * The files of two threads: a store of the test's own, and the data folder its bytes are under. T has one file, U has
 * two, and V's name is one that climbs: the name is kept, and it names no folder of the store.
 */
const filesDir = await mkdtemp(join(tmpdir(), "que-op-files-"));
const fileDb = new PGlite();
const fileStore = fileStoreOn(fileDb, filesDir);
process.on("exit", () => rmSync(filesDir, { recursive: true, force: true }));

const csv = (...rows: string[]) =>
  Buffer.from([["name", "qty"], ...rows].join("\n") + "\n");
const orderBytes = csv("Ana,3", "Bo,4");
const order = await fileStore.put("T", {
  name: "orders.csv",
  mimeType: "text/csv",
  bytes: orderBytes,
});
const prices = await fileStore.put("U", {
  name: "prices.csv",
  mimeType: "text/csv",
  bytes: csv("Nibs,7"),
});
const credits = await fileStore.put("U", {
  name: "credits.csv",
  mimeType: "text/csv",
  bytes: csv("Bo,2"),
});
const returns = await fileStore.put("V", {
  name: "../returns.csv",
  mimeType: "text/csv",
  bytes: csv("Ana,1"),
});

// What an op's context gives, as the test reads it: the thread's files by name, so their order is the test's, and one
// file by its id.
const reading = async (
  ctx: {
    files: {
      get(id: string): Promise<unknown>;
      list(): Promise<{ name: string }[]>;
    };
  },
  id: string,
) => ({
  listed: [...(await ctx.files.list())].sort((a, b) =>
    a.name.localeCompare(b.name),
  ),
  got: await ctx.files.get(id),
});

const vault = definePlugin({
  name: "vault",
  type: "plugin",
  title: "Vault",
  description: "Reads the run's files.",
  ops: [
    {
      name: "vault-files",
      type: "op",
      title: "Read the files",
      description: "Lists the run's files and reads one by its id.",
      input: z.object({ file: z.string().describe("A file id") }),
      run: async (ctx, { file }) => reading(ctx, file),
    },
  ],
});

const claims = definePlugin({
  name: "claims",
  type: "plugin",
  kind: "domain",
  title: "Claims",
  description:
    "A domain that reads the run's files, and one that calls the vault's op.",
  ops: [
    {
      name: "claims-files",
      type: "op",
      title: "Read the files",
      description: "Lists the run's files and reads one by its id.",
      input: z.object({ file: z.string().describe("A file id") }),
      run: async (ctx, { file }) => reading(ctx, file),
    },
    {
      name: "claims-forward",
      type: "op",
      title: "Forward to the vault",
      description:
        "Reads the run's files itself, and through the vault's op it lists.",
      uses: ["vault-files"],
      input: z.object({ file: z.string().describe("A file id") }),
      run: async ({ ops, files }, { file }) => ({
        own: (await files.list()).map(({ name }) => name).sort(),
        nested: await ops["vault-files"]({ file }),
      }),
    },
  ],
});

const vaultFiles: PlacedOp = { plugin: vault.plugin, op: vault.ops[0] };
const claimsFiles: PlacedOp = { plugin: claims.plugin, op: claims.ops[0] };
const claimsForward: PlacedOp = { plugin: claims.plugin, op: claims.ops[1] };
const fileCall = door(
  async (plugin, role, user) => `${plugin.name}:${role ?? "none"}:${user}`,
  [vaultFiles, claimsFiles, claimsForward],
);

test("given a connector op and a domain op on a thread with a file, when each is called, then its context's files are that thread's: get gives the bytes and what they are, and list gives their metadata", async () => {
  const scope = { files: fileStore, thread: "T" };
  const expected = { listed: [order], got: { ...order, bytes: orderBytes } };
  const answered = (op: PlacedOp) =>
    fileCall(op, { file: order.id }, "ana", scope).catch(
      (error: unknown) => error,
    );

  assert.deepEqual(
    await answered(vaultFiles),
    expected,
    "a connector op's context has the run thread's files",
  );
  assert.deepEqual(
    await answered(claimsFiles),
    expected,
    "a domain op's context has the run thread's files",
  );

  const { got } = (await answered(vaultFiles)) as { got: object };
  assert.deepEqual(
    Object.keys(got).sort(),
    ["bytes", "id", "mimeType", "name", "size"],
    "a file is its id, name, mime type, size and bytes",
  );
  assert.equal(
    JSON.stringify(got).includes(filesDir),
    false,
    "a file names no store path",
  );
});

test("given an op on a thread with a file and a file of another thread, when the op asks for that file's id, then the call is an OpFailed that names the file and no store path", async () => {
  const scope = { files: fileStore, thread: "T" };
  const refused = (id: string) =>
    fileCall(vaultFiles, { file: id }, "ana", scope).catch(
      (error: unknown) => error,
    );

  const other = await refused(prices.id);
  assert.ok(
    other instanceof OpFailed,
    `expected an OpFailed for U's file, got ${String(other)}`,
  );
  assert.ok(
    other.message.includes(prices.id),
    `expected the OpFailed to name ${prices.id}, got "${other.message}"`,
  );
  assert.equal(
    other.message.includes(filesDir),
    false,
    "the failure names no store path",
  );

  const climbing = await refused(returns.id);
  assert.ok(
    climbing instanceof OpFailed,
    `expected an OpFailed for V's file, got ${String(climbing)}`,
  );
  assert.ok(
    climbing.message.includes(returns.id),
    `expected the OpFailed to name ${returns.id}, got "${climbing.message}"`,
  );
  assert.equal(
    climbing.message.includes(filesDir),
    false,
    "the failure names no store path",
  );
});

test("given a domain op whose op calls a connector op it lists, when the domain op is called on a thread, then the nested call gets the same thread's files", async () => {
  const answered = (thread: string, file: string) =>
    fileCall(claimsForward, { file }, "ana", {
      files: fileStore,
      thread,
    }).catch((error: unknown) => error);

  assert.deepEqual(
    await answered("T", order.id),
    {
      own: ["orders.csv"],
      nested: { listed: [order], got: { ...order, bytes: orderBytes } },
    },
    "the nested call reads T's file, the thread of the call that made it",
  );
  assert.deepEqual(
    await answered("U", credits.id),
    {
      own: ["credits.csv", "prices.csv"],
      nested: {
        listed: [credits, prices],
        got: { ...credits, bytes: csv("Bo,2") },
      },
    },
    "the nested call reads U's files, not the last call's thread",
  );
});
