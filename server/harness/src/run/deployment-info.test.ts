import { test } from "node:test";
import assert from "node:assert/strict";
import { deploymentInfo } from "./deployment-info.js";

const big = {
  name: "big",
  id: "fireworks:big-model",
  window: 1_000_000,
  maxTokens: 100_000,
  price: { input: 1, output: 2 },
};
const small = {
  name: "small",
  id: "fireworks:small-model",
  window: 64_000,
  maxTokens: 8_000,
  price: { input: 0.5, output: 1, cachedInput: 0.1 },
};
const chat = { name: "chat", packages: [] };
const lean = {
  name: "lean",
  packages: [],
  model: "small",
  instructions: "Be brief.",
};

test("an agent has the model it names, and one that names none has the first model listed", () => {
  const { agents } = deploymentInfo([chat, lean], [big, small], []);
  assert.deepEqual(
    agents.map(({ name, model }) => ({ name, model })),
    [
      { name: "chat", model: "big" },
      { name: "lean", model: "small" },
    ],
  );
});

test("a model has its name, window, maxTokens and price, and no provider id", () => {
  assert.deepEqual(deploymentInfo([chat], [big, small], []).models, [
    {
      name: "big",
      window: 1_000_000,
      maxTokens: 100_000,
      price: { input: 1, output: 2 },
    },
    {
      name: "small",
      window: 64_000,
      maxTokens: 8_000,
      price: { input: 0.5, output: 1, cachedInput: 0.1 },
    },
  ]);
});

test("an agent has the share its loop summarizes at, and none when it does not summarize", () => {
  const loops = [
    { name: "long-chat" },
    { name: "early", summarize: { at: 0.5, keep: 0.1 } },
    { name: "whole", summarize: false as const },
  ];
  const on = (loop?: string) => ({ name: loop ?? "bare", packages: [], loop });
  const { agents } = deploymentInfo(
    [on("long-chat"), on("early"), on("whole"), on()],
    [big],
    loops,
  );
  assert.deepEqual(agents, [
    // que's own share, when the loop leaves it out. A config that names no loop does not summarize.
    { name: "long-chat", model: "big", summarizeAt: 0.85 },
    { name: "early", model: "big", summarizeAt: 0.5 },
    { name: "whole", model: "big" },
    { name: "bare", model: "big" },
  ]);
});
