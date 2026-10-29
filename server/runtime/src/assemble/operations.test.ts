import { test } from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { definePlugin, OpFailed } from "@mku1tra/que-plugin";
import type { Catalog } from "../access/catalog.js";
import { door, type PlacedOp } from "./door.js";
import { operationTools } from "./operations.js";

const shop = definePlugin({
  name: "shop",
  type: "plugin",
  title: "Shop",
  description: "The shop's order system.",
  ops: [
    {
      name: "shop-get-order",
      type: "op",
      title: "Get order",
      description: "One order with its lines.",
      input: z.object({ id: z.number().describe("Order id") }),
      run: async ({ conn }, { id }) => {
        if (id < 0) throw new OpFailed("no such order");
        if (id === 0) throw new Error("bug");
        return { id, by: conn };
      },
    },
  ],
});
const catalog: Catalog = [{ plugin: { definition: shop, skills: [] } }];

// The door, on access that gives each plugin a connection named for it, called as one user.
const call = door(async (plugin) => `conn:${plugin.name}`);
const [getOrder] = operationTools(catalog, (op, params) =>
  call(op, params, "ana"),
);

test("an operation becomes a tool of its op's name, with its own title, description and arguments", () => {
  assert.equal(getOrder.name, "shop-get-order");
  assert.equal(getOrder.description, "Get order: One order with its lines.");
  // The tool holds its op's input as JSON Schema, apart from the draft it names.
  assert.deepEqual(
    { ...getOrder.schema, $schema: undefined },
    {
      $schema: undefined,
      type: "object",
      properties: { id: { type: "number", description: "Order id" } },
      required: ["id"],
      additionalProperties: false,
    },
  );
});

test("it runs with the connection it is given, and returns the result as JSON", async () => {
  assert.equal(
    await getOrder.invoke({ id: 4 }),
    JSON.stringify({ id: 4, by: "conn:shop" }),
  );
});

test("an OpFailed is thrown on, for the agent to mark as a failed call", async () => {
  await assert.rejects(
    () => getOrder.invoke({ id: -1 }),
    (error: Error) =>
      error instanceof OpFailed && error.message === "no such order",
  );
});

test("any other error is a bug, and is thrown", async () => {
  await assert.rejects(() => getOrder.invoke({ id: 0 }), /bug/);
});

test("the tool runs through the call it is given, with its op, the op's plugin and the params, and returns what the call gives as JSON", async () => {
  const calls: { op: PlacedOp; params: unknown }[] = [];
  const [recorded] = operationTools(catalog, async (op, params) => {
    calls.push({ op, params });
    return { call: calls.length };
  });

  assert.equal(await recorded.invoke({ id: 4 }), JSON.stringify({ call: 1 }));
  assert.equal(await recorded.invoke({ id: 7 }), JSON.stringify({ call: 2 }));

  assert.deepEqual(calls, [
    { op: { plugin: shop.plugin, op: shop.ops[0] }, params: { id: 4 } },
    { op: { plugin: shop.plugin, op: shop.ops[0] }, params: { id: 7 } },
  ]);
});

test("an op whose input has a transform gets the transformed value in run when called through its tool, and the tool's input is the op's", async () => {
  const seen: unknown[] = [];
  const tags = definePlugin({
    name: "tags",
    type: "plugin",
    title: "Tags",
    description: "The tags of orders.",
    ops: [
      {
        name: "tags-get",
        type: "op",
        title: "Get tags",
        description: "The tags of the orders named.",
        input: z.object({
          ids: z
            .string()
            .transform((s) => s.split(","))
            .describe("Order ids, comma-separated"),
        }),
        run: async (_ctx, { ids }) => {
          seen.push(ids);
          return ids;
        },
      },
    ],
  });
  const [getTags] = operationTools(
    [{ plugin: { definition: tags, skills: [] } }],
    (op, params) => call(op, params, "ana"),
  );

  // What the model is sent: the tool's input as JSON Schema, as LangChain writes it, apart from the draft it names.
  const sent = { ...toJsonSchema(getTags.schema), $schema: undefined };
  const own = { ...toJsonSchema(tags.ops[0].input), $schema: undefined };
  assert.deepEqual(sent, own);
  // A call that throws gives its message, so a wrong parse shows in the assertion.
  const answer = (ids: string) =>
    getTags.invoke({ ids }).catch((error: Error) => error.message);
  assert.equal(await answer("a,b"), JSON.stringify(["a", "b"]));
  assert.equal(await answer("c"), JSON.stringify(["c"]));
  assert.deepEqual(seen, [["a", "b"], ["c"]]);
});

test("the tool shows the input side of its op's input: a transform from a string shows a string, and a field with a default is not required", () => {
  const tags = definePlugin({
    name: "tags",
    type: "plugin",
    title: "Tags",
    description: "The tags of orders.",
    ops: [
      {
        name: "tags-find",
        type: "op",
        title: "Find tags",
        description: "The tags of the orders named.",
        input: z.object({
          ids: z
            .string()
            .transform((s) => s.split(","))
            .describe("Order ids, comma-separated"),
          limit: z.number().default(10).describe("How many tags"),
        }),
        run: async (_ctx, { ids, limit }) => ids.slice(0, limit),
      },
    ],
  });
  const [findTags] = operationTools(
    [{ plugin: { definition: tags, skills: [] } }],
    (op, params) => call(op, params, "ana"),
  );

  assert.deepEqual(
    { ...findTags.schema, $schema: undefined },
    {
      $schema: undefined,
      type: "object",
      properties: {
        ids: { type: "string", description: "Order ids, comma-separated" },
        limit: { type: "number", default: 10, description: "How many tags" },
      },
      required: ["ids"],
      additionalProperties: false,
    },
  );
});
