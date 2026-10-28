import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { load } from "./load.js";

const deployment = (name: string) =>
  join(import.meta.dirname, "../fixtures/deployments", name);

test("loads the name of a deployment, the cases of each plugin it lists, each with its plugin, and its agent configs as written, in order", async () => {
  const { deployment: name, cases, agents } = await load(deployment("shop"));
  assert.deepEqual(
    { deployment: name, cases, agents },
    {
      deployment: "shop-deployment",
      cases: [
        {
          plugin: "shop",
          name: "find-order-by-customer",
          type: "case" as const,
          description:
            "Finds the order of a customer by name, and gives its state.",
          capability: "find-order",
          input: "Where is the order of Ada?",
          start: "Ada has one open order.",
          good: "The answer gives the state of the order of Ada.",
        },
        {
          plugin: "shop",
          name: "find-order-not-asked",
          type: "case" as const,
          description: "Calls no operation when no order is asked for.",
          capability: "find-order",
          input: "What can you do?",
          start: "Any.",
          good: "No operation is called.",
        },
      ],
      agents: [
        {
          name: "chat",
          type: "agent" as const,
          description: "The chat agent of a fixture.",
          plugins: ["shop", "notes"],
          model: "small",
          loop: "long-chat",
        },
        {
          name: "lean",
          type: "agent" as const,
          description: "The lean agent of a fixture.",
          plugins: ["shop", "notes"],
          model: "small",
          loop: "long-chat",
        },
        {
          name: "notes-only",
          type: "agent" as const,
          description: "The notes-only agent of a fixture.",
          plugins: ["notes"],
          model: "small",
          loop: "long-chat",
        },
      ],
    },
  );
});

test("loads the model configs of a deployment, as written, in order", async () => {
  assert.deepEqual((await load(deployment("shop"))).models, [
    {
      name: "small",
      type: "model" as const,
      description: "The small model of a fixture.",
      id: "fireworks:accounts/fireworks/models/small-model",
      window: 128_000,
      maxTokens: 8_000,
    },
    {
      name: "big",
      type: "model" as const,
      description: "The big model of a fixture.",
      id: "fireworks:accounts/fireworks/models/big-model",
      window: 1_000_000,
      maxTokens: 64_000,
    },
  ]);
});

test("stops, naming the case and its capability, on a case whose capability no plugin of the deployment holds", async () => {
  await assert.rejects(load(deployment("broken")), (error: Error) => {
    assert.match(error.message, /^eval:/);
    assert.match(
      error.message,
      /cases\.ts#refund-asked: \/capability: It points at refund, which is not a node\. \(basis\/link\)/,
    );
    assert.ok(error.cause instanceof Error);
    return true;
  });
});

test("stops, naming both plugins, when two plugins of the deployment hold one capability", async () => {
  await assert.rejects(load(deployment("capability-twice")), (error: Error) => {
    assert.match(
      error.message,
      /shop\/io\.github\.matta-kelly\.que\/index\.ts#capabilities\/find-order: The name find-order is also the name of .*shop-twin\/io\.github\.matta-kelly\.que\/index\.ts#capabilities\/find-order\. \(basis\/unique-name\)/,
    );
    return true;
  });
});
