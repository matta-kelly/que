import { test } from "node:test";
import assert from "node:assert/strict";
import { report } from "./report.js";

const byCustomer = {
  plugin: "shop",
  name: "find-order-by-customer",
  capability: "find-order",
  input: "Where is the order of Ada?",
  start: "Ada has one open order.",
  good: "The answer gives the state of the order of Ada.",
};

const notAsked = {
  plugin: "shop",
  name: "find-order-not-asked",
  capability: "find-order",
  input: "What can you do?",
  start: "Any.",
  good: "No operation is called.",
};

test("the report has each case with its input, start and good, and each run under its agent", () => {
  assert.equal(
    report([
      {
        case: byCustomer,
        agent: "chat",
        record: {
          steps: [
            {
              kind: "call",
              name: "shop_findOrders",
              args: { customer: "Ada" },
            },
            {
              kind: "result",
              name: "shop_findOrders",
              text: '[{"id":12,\n"state":"open"}]',
            },
          ],
          answer: "Order 12 of Ada is open.\nIt was placed on Monday.",
        },
      },
      {
        case: byCustomer,
        agent: "lean",
        error: 'no agent "lean". Agents: chat',
      },
    ]),
    `shop / find-order / find-order-by-customer
  input  Where is the order of Ada?
  start  Ada has one open order.
  good   The answer gives the state of the order of Ada.

  [chat]
    call     shop_findOrders {"customer":"Ada"}
    result   [{"id":12, "state":"open"}]
    answer   Order 12 of Ada is open.
             It was placed on Monday.

  [lean]
    error    no agent "lean". Agents: chat

2 runs, 1 did not finish, 0 skipped`,
  );
});

test("the report has the verdict of each judged run, and how many passed under each agent", () => {
  assert.equal(
    report([
      {
        case: byCustomer,
        agent: "chat",
        record: { steps: [], answer: "Order 12 of Ada is open." },
        verdict: { pass: true, reason: "The answer gives the state." },
      },
      {
        case: byCustomer,
        agent: "lean-chat",
        record: { steps: [], answer: "Ada has an order." },
        verdict: {
          pass: false,
          reason: "The answer names an order.\nIt does not give its state.",
        },
      },
      {
        case: notAsked,
        agent: "chat",
        record: { steps: [], answer: "I can find the shop's orders." },
        verdict: { none: "the reply has no VERDICT line" },
      },
      { case: notAsked, agent: "lean-chat", error: "it stopped" },
    ]),
    `shop / find-order / find-order-by-customer
  input  Where is the order of Ada?
  start  Ada has one open order.
  good   The answer gives the state of the order of Ada.

  [chat]
    answer   Order 12 of Ada is open.
    verdict  pass  The answer gives the state.

  [lean-chat]
    answer   Ada has an order.
    verdict  fail  The answer names an order. It does not give its state.

shop / find-order / find-order-not-asked
  input  What can you do?
  start  Any.
  good   No operation is called.

  [chat]
    answer   I can find the shop's orders.
    verdict  none  the reply has no VERDICT line

  [lean-chat]
    error    it stopped

4 runs, 1 did not finish, 0 skipped
  [chat]       1 of 2 passed
  [lean-chat]  0 of 1 passed`,
  );
});

test("the report cuts a long result to 200 characters, and marks it", () => {
  const out = report([
    {
      case: byCustomer,
      agent: "chat",
      record: {
        steps: [
          { kind: "result", name: "shop_findOrders", text: "x".repeat(250) },
        ],
        answer: "Open.",
      },
    },
  ]);
  assert.ok(out.includes(`    result   ${"x".repeat(200)} (cut)\n`));
  assert.ok(!out.includes("x".repeat(201)));
});
