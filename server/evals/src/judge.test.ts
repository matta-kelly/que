/**
 * The judge: its question and its reading of a reply, which have no model in
 * them, and its call, on the framework's model that is not real.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { AIMessage, fakeModel } from "langchain";
import { judge, judged, question, verdictOf } from "./judge.js";

const byCustomer = {
  package: "shop",
  name: "find-order-by-customer",
  capability: "find-order",
  input: "Where is the order of Ada?",
  start: "Ada has one open order.",
  good: "The answer gives the state of the order of Ada.",
};
const notAsked = {
  package: "shop",
  name: "find-order-not-asked",
  capability: "find-order",
  input: "What can you do?",
  start: "Any.",
  good: "No operation is called.",
};
const small = {
  name: "small",
  id: "fireworks:accounts/fireworks/models/small-model",
  window: 128_000,
  maxTokens: 8_000,
};

const open = {
  steps: [
    {
      kind: "call" as const,
      name: "shop_findOrders",
      args: { customer: "Ada" },
    },
    {
      kind: "result" as const,
      name: "shop_findOrders",
      text: '[{"id":12,"state":"open"}]',
    },
  ],
  answer: "Order 12 of Ada is open.",
};
const orders = { steps: [], answer: "I can find the shop's orders." };

test("the judge is asked for each run that finished, and for no other", async () => {
  const asked: unknown[] = [];
  const verdict = { pass: true, reason: "It is so." };
  const outcomes = await judged(
    [
      { case: byCustomer, agent: "chat", record: open },
      { case: byCustomer, agent: "lean", error: "it stopped" },
      {
        case: byCustomer,
        agent: "notes-only",
        skipped: "notes-only does not have shop",
      },
      { case: notAsked, agent: "chat", record: orders },
    ],
    (c, record) => {
      asked.push({ case: c, record });
      return Promise.resolve(verdict);
    },
  );
  assert.deepEqual(asked, [
    { case: byCustomer, record: open },
    { case: notAsked, record: orders },
  ]);
  assert.deepEqual(outcomes, [
    { case: byCustomer, agent: "chat", record: open, verdict },
    { case: byCustomer, agent: "lean", error: "it stopped" },
    {
      case: byCustomer,
      agent: "notes-only",
      skipped: "notes-only does not have shop",
    },
    { case: notAsked, agent: "chat", record: orders, verdict },
  ]);
});

test("the question has the case, each call, each result and the answer", () => {
  const text = question(byCustomer, open);
  assert.ok(text.includes("Where is the order of Ada?"));
  assert.ok(text.includes("Ada has one open order."));
  assert.ok(text.includes("The answer gives the state of the order of Ada."));
  assert.ok(text.includes('shop_findOrders {"customer":"Ada"}'));
  assert.ok(text.includes('[{"id":12,"state":"open"}]'));
  assert.ok(text.includes("Order 12 of Ada is open."));
});

test("the question cuts a long result to 2,000 characters, and marks it", () => {
  const text = question(byCustomer, {
    steps: [
      { kind: "result", name: "shop_findOrders", text: "x".repeat(2_500) },
    ],
    answer: "y".repeat(2_500),
  });
  assert.ok(text.includes(`${"x".repeat(2_000)} (cut)`));
  assert.ok(!text.includes("x".repeat(2_001)));
  // The answer is given whole.
  assert.ok(text.includes("y".repeat(2_500)));
});

test("a reply that ends with a verdict of yes is a pass, of no is a fail, and the reason is the rest", () => {
  assert.deepEqual(
    verdictOf(
      "The answer says the order is open.\nIt is order 12.\nVERDICT: yes",
    ),
    {
      pass: true,
      reason: "The answer says the order is open.\nIt is order 12.",
    },
  );
  // The line is read the same in another case, and with spaces around it.
  assert.deepEqual(verdictOf("The answer names no order.\n  verdict: NO \n"), {
    pass: false,
    reason: "The answer names no order.",
  });
});

test("a reply with no verdict line is no verdict", () => {
  assert.deepEqual(verdictOf("The answer says the order is open."), {
    none: "the reply has no VERDICT line",
  });
});

test("a call to the model that fails is no verdict, and the next run is judged", async () => {
  const model = fakeModel()
    .respond(new Error("429 too many requests"))
    .respond(new AIMessage("The answer says the order is open.\nVERDICT: yes"));
  const ask = judge(small, () => model);
  assert.deepEqual(await ask(byCustomer, open), {
    none: "the call to the model failed: 429 too many requests",
  });
  assert.deepEqual(await ask(notAsked, orders), {
    pass: true,
    reason: "The answer says the order is open.",
  });
});
