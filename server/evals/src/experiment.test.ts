import { test } from "node:test";
import assert from "node:assert/strict";
import { experiments } from "./experiment.js";

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
const chat = {
  name: "chat",
  plugins: ["shop", "notes"],
  model: "small",
  loop: "long-chat",
};
const lean = {
  name: "lean",
  plugins: ["shop"],
  model: "small",
  loop: "long-chat",
};
const notesOnly = {
  name: "notes-only",
  plugins: ["notes"],
  model: "small",
  loop: "long-chat",
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

const run = {
  deployment: "shop",
  commit: "abc1234",
  at: "2026-10-13T07:47:11Z",
  cases: [byCustomer, notAsked],
  agents: [chat, lean, notesOnly],
};

test("the dataset has the name of the deployment, and one item for each case", () => {
  assert.deepEqual(experiments({ ...run, outcomes: [] }).dataset, {
    name: "shop",
    items: [
      {
        id: "shop.shop.find-order-by-customer",
        input: "Where is the order of Ada?",
        expected: "The answer gives the state of the order of Ada.",
        metadata: {
          plugin: "shop",
          capability: "find-order",
          case: "find-order-by-customer",
          start: "Ada has one open order.",
        },
      },
      {
        id: "shop.shop.find-order-not-asked",
        input: "What can you do?",
        expected: "No operation is called.",
        metadata: {
          plugin: "shop",
          capability: "find-order",
          case: "find-order-not-asked",
          start: "Any.",
        },
      },
    ],
  });
});

test("there is one experiment for each agent, in the order the deployment lists them, named by the agent and the commit", () => {
  const { experiments: made } = experiments({
    ...run,
    outcomes: [
      { case: byCustomer, agent: "lean", record: open },
      { case: byCustomer, agent: "chat", record: open },
      { case: notAsked, agent: "lean", record: orders },
      { case: notAsked, agent: "chat", record: orders },
    ],
  });
  assert.deepEqual(
    made.map(({ agent, name, run }) => ({ agent, name, run })),
    [
      {
        agent: "chat",
        name: "chat@abc1234",
        run: "chat@abc1234 2026-10-13T07:47:11Z",
      },
      {
        agent: "lean",
        name: "lean@abc1234",
        run: "lean@abc1234 2026-10-13T07:47:11Z",
      },
    ],
  );
});

test("the metadata of an experiment has the agent's name, its config as written, the commit and the deployment", () => {
  const { experiments: made } = experiments({
    ...run,
    outcomes: [{ case: byCustomer, agent: "lean", record: open }],
  });
  assert.deepEqual(made[0].metadata, {
    agent: "lean",
    config: lean,
    commit: "abc1234",
    deployment: "shop",
  });
});

test("the metadata of an experiment names the judge", () => {
  const { experiments: made } = experiments({
    ...run,
    judge: "small",
    outcomes: [{ case: byCustomer, agent: "lean", record: open }],
  });
  assert.deepEqual(made[0].metadata, {
    agent: "lean",
    config: lean,
    commit: "abc1234",
    deployment: "shop",
    judge: "small",
  });
});

test("the output of a run is its record, and the output of a run that did not finish is its error", () => {
  const { experiments: made } = experiments({
    ...run,
    outcomes: [
      { case: byCustomer, agent: "chat", record: open },
      { case: notAsked, agent: "chat", error: "it stopped" },
    ],
  });
  assert.deepEqual(made[0].outputs, [
    { item: "shop.shop.find-order-by-customer", output: open },
    { item: "shop.shop.find-order-not-asked", output: { error: "it stopped" } },
  ]);
});

test("a skipped run is in no experiment, and an agent with no run made has no experiment", () => {
  const { experiments: made } = experiments({
    ...run,
    outcomes: [
      { case: byCustomer, agent: "chat", record: open },
      {
        case: byCustomer,
        agent: "notes-only",
        skipped: "notes-only does not have shop",
      },
    ],
  });
  assert.deepEqual(
    made.map(({ agent, outputs }) => ({ agent, outputs })),
    [
      {
        agent: "chat",
        outputs: [{ item: "shop.shop.find-order-by-customer", output: open }],
      },
    ],
  );
});
