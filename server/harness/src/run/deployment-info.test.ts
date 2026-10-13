import { test } from "node:test";
import assert from "node:assert/strict";
import { deploymentInfo } from "./deployment-info.js";

const big = {
  name: "big",
  id: "fireworks:big-model",
  window: 1_000_000,
  maxTokens: 100_000,
};
const small = {
  name: "small",
  id: "fireworks:small-model",
  window: 64_000,
  maxTokens: 8_000,
};
const chat = { name: "chat" };
const lean = { name: "lean", model: "small", instructions: "Be brief." };

test("an agent has the model it names, and one that names none has the first model listed", () => {
  assert.deepEqual(deploymentInfo([chat, lean], [big, small]).agents, [
    { name: "chat", model: "big" },
    { name: "lean", model: "small" },
  ]);
});

test("a model has its name, window and maxTokens, and no provider id", () => {
  assert.deepEqual(deploymentInfo([chat], [big]).models, [
    { name: "big", window: 1_000_000, maxTokens: 100_000 },
  ]);
});
