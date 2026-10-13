import { test } from "node:test";
import assert from "node:assert/strict";
import { report } from "./report.js";

const byCustomer = {
  package: "shop",
  name: "find-order-by-customer",
  capability: "find-order",
  input: "Where is the order of Ada?",
  start: "Ada has one open order.",
  good: "The answer gives the state of the order of Ada.",
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

test("a run with no agent named is shown as default", () => {
  assert.match(
    report([{ case: byCustomer, record: { steps: [], answer: "Open." } }]),
    /\n {2}\[default\]\n {4}answer {3}Open\.\n/,
  );
});

test("the report shows a skipped run, with the agent and the package it does not have", () => {
  assert.match(
    report([
      {
        case: byCustomer,
        agent: "notes-only",
        skipped: "notes-only does not have shop",
      },
    ]),
    /\n {2}\[notes-only\]\n {4}skipped {2}notes-only does not have shop\n/,
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

test("the last line counts the runs, the ones that did not finish, and the ones skipped", () => {
  const out = report([
    { case: byCustomer, agent: "chat", record: { steps: [], answer: "Open." } },
    { case: byCustomer, agent: "lean", error: "it stopped" },
    {
      case: byCustomer,
      agent: "notes-only",
      skipped: "notes-only does not have shop",
    },
  ]);
  assert.equal(out.split("\n").at(-1), "2 runs, 1 did not finish, 1 skipped");
});
