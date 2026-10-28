import { test } from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import { definePlugin, OpFailed } from "@mku1tra/que-plugin";
import type { Catalog } from "../access/catalog.js";
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

const [getOrder] = operationTools(
  catalog,
  async (plugin) => `conn:${plugin.name}`,
);

test("an operation becomes a tool of its op's name, with its own title, description and arguments", () => {
  assert.equal(getOrder.name, "shop-get-order");
  assert.equal(getOrder.description, "Get order: One order with its lines.");
  assert.equal(getOrder.schema, shop.ops[0].input);
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
