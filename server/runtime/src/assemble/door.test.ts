import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from "@opentelemetry/sdk-trace";
import fc from "fast-check";
import * as z from "zod";
import { definePlugin, OpFailed } from "@mku1tra/que-plugin";
import { storeOn } from "@que/credentials";
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
      }),
      run: async (_ctx, { ids }) => ids,
    },
  ],
});
const getOrder: PlacedOp = { plugin: shop.plugin, op: shop.ops[0] };
const listOrders: PlacedOp = { plugin: shop.plugin, op: shop.ops[1] };
const tagOrders: PlacedOp = { plugin: shop.plugin, op: shop.ops[2] };

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
