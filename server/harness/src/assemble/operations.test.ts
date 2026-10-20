import { test } from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import { definePlugin, OperationFailed } from "@que/core";
import type { Catalog } from "../access/catalog.js";
import { operationTools, toolName } from "./operations.js";

const shop = definePlugin({
  name: "shop",
  title: "Shop",
  description: "The shop's order system.",
  ops: [
    {
      name: "getOrder",
      title: "Get order",
      description: "One order with its lines.",
      schema: z.object({ id: z.number().describe("Order id") }),
      run: async ({ conn }, { id }) => {
        if (id < 0) throw new OperationFailed("no such order");
        if (id === 0) throw new Error("bug");
        return { id, by: conn };
      },
    },
  ],
});
const catalog: Catalog = [{ pkg: { definition: shop, skills: [] } }];

const [getOrder] = operationTools(catalog, async (pkg) => `conn:${pkg.name}`);

test("an operation becomes a tool named <package>_<operation>, with its own title, description and arguments", () => {
  assert.equal(getOrder.name, toolName("shop", "getOrder"));
  assert.equal(getOrder.name, "shop_getOrder");
  assert.equal(getOrder.description, "Get order: One order with its lines.");
  assert.equal(getOrder.schema, shop.ops[0].schema);
});

test("it runs with the connection it is given, and returns the result as JSON", async () => {
  assert.equal(
    await getOrder.invoke({ id: 4 }),
    JSON.stringify({ id: 4, by: "conn:shop" }),
  );
});

test("an OperationFailed is thrown on, for the agent to mark as a failed call", async () => {
  await assert.rejects(
    () => getOrder.invoke({ id: -1 }),
    (error: Error) =>
      error instanceof OperationFailed && error.message === "no such order",
  );
});

test("any other error is a bug, and is thrown", async () => {
  await assert.rejects(() => getOrder.invoke({ id: 0 }), /bug/);
});
