import { test } from "node:test";
import assert from "node:assert/strict";
import { record } from "./record.js";

test("the record of a thread has each call, each result and the answer, in order", () => {
  assert.deepEqual(
    record([
      { from: "user", text: "What can you do?", calls: [] },
      {
        from: "agent",
        text: "",
        calls: [{ name: "open_package", args: { package: "shop" } }],
      },
      {
        from: "tool",
        tool: "open_package",
        text: "# Shop (`shop`)",
        calls: [],
      },
      {
        from: "agent",
        text: "I can find the shop's orders by customer name.",
        calls: [],
      },
    ]),
    {
      steps: [
        { kind: "call", name: "open_package", args: { package: "shop" } },
        { kind: "result", name: "open_package", text: "# Shop (`shop`)" },
      ],
      answer: "I can find the shop's orders by customer name.",
    },
  );
});

test("a message with two calls gives two calls, in order", () => {
  assert.deepEqual(
    record([
      { from: "user", text: "Where are the orders of Ada and Bo?", calls: [] },
      {
        from: "agent",
        text: "",
        calls: [
          { name: "shop_findOrders", args: { customer: "Ada" } },
          { name: "shop_findOrders", args: { customer: "Bo" } },
        ],
      },
    ]).steps,
    [
      { kind: "call", name: "shop_findOrders", args: { customer: "Ada" } },
      { kind: "call", name: "shop_findOrders", args: { customer: "Bo" } },
    ],
  );
});

test("a thread that ends on a result has no answer", () => {
  assert.equal(
    record([
      { from: "user", text: "Where is the order of Ada?", calls: [] },
      {
        from: "agent",
        text: "",
        calls: [{ name: "shop_findOrders", args: { customer: "Ada" } }],
      },
      { from: "tool", tool: "shop_findOrders", text: "[]", calls: [] },
    ]).answer,
    "",
  );
});
