import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { load } from "./load.js";

const deployment = (name: string) =>
  join(import.meta.dirname, "../fixtures/deployments", name);

test("loads the name of a deployment, the cases of each package it lists, each with its package, and its agent configs as written, in order", async () => {
  const { deployment: name, cases, agents } = await load(deployment("shop"));
  assert.deepEqual(
    { deployment: name, cases, agents },
    {
      deployment: "shop",
      cases: [
        {
          package: "shop",
          name: "find-order-by-customer",
          capability: "find-order",
          input: "Where is the order of Ada?",
          start: "Ada has one open order.",
          good: "The answer gives the state of the order of Ada.",
        },
        {
          package: "shop",
          name: "find-order-not-asked",
          capability: "find-order",
          input: "What can you do?",
          start: "Any.",
          good: "No operation is called.",
        },
      ],
      agents: [
        {
          name: "chat",
          packages: ["shop", "notes"],
          model: "small",
          loop: "long-chat",
        },
        {
          name: "lean",
          packages: ["shop", "notes"],
          model: "small",
          loop: "long-chat",
        },
        {
          name: "notes-only",
          packages: ["notes"],
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
      id: "fireworks:accounts/fireworks/models/small-model",
      window: 128_000,
      maxTokens: 8_000,
    },
    {
      name: "big",
      id: "fireworks:accounts/fireworks/models/big-model",
      window: 1_000_000,
      maxTokens: 64_000,
    },
  ]);
});

test("stops on an agent that leaves out its packages, so no run is planned under every package", async () => {
  await assert.rejects(load(deployment("packageless")), (error: Error) => {
    assert.match(error.message, /^eval:/);
    assert.match(
      error.message,
      /agent packageless is invalid:\n- packages is missing/,
    );
    return true;
  });
});

test("stops, naming the package, on cases that break the contract", async () => {
  await assert.rejects(load(deployment("broken")), (error: Error) => {
    assert.match(error.message, /^eval:/);
    assert.match(error.message, /cases of package broken are invalid/);
    assert.ok(error.cause instanceof Error);
    return true;
  });
});
