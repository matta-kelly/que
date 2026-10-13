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
const chat = { name: "chat" };
const lean = { name: "lean", model: "small", instructions: "Be brief." };

test("an agent has the model it names, and one that names none has the first model listed", () => {
  assert.deepEqual(deploymentInfo([chat, lean], [big, small], []).agents, [
    { name: "chat", model: "big" },
    { name: "lean", model: "small" },
  ]);
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
    { name: "deep", engine: "deepagents" as const },
    {
      name: "deep-early",
      engine: "deepagents" as const,
      summarize: { at: 0.5, keep: 0.1 },
    },
    {
      name: "deep-whole",
      engine: "deepagents" as const,
      summarize: false as const,
    },
    { name: "long-chat", summarize: { at: 0.5, keep: 0.1 } },
  ];
  const on = (loop?: string) => ({ name: loop ?? "bare", loop });
  const { agents } = deploymentInfo(
    [on("deep"), on("deep-early"), on("deep-whole"), on("long-chat"), on()],
    [big],
    loops,
  );
  assert.deepEqual(agents, [
    // que's own share, when the loop leaves it out.
    { name: "deep", model: "big", summarizeAt: 0.85 },
    { name: "deep-early", model: "big", summarizeAt: 0.5 },
    { name: "deep-whole", model: "big" },
    // No setting acts on the plain engine, so its share is not one the chat reaches.
    { name: "long-chat", model: "big" },
    { name: "bare", model: "big" },
  ]);
});
