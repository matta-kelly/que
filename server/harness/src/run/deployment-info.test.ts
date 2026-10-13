import { test } from "node:test";
import assert from "node:assert/strict";
import { deploymentInfo } from "./deployment-info.js";
import { OWN_MODEL } from "./model.js";

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

test("deploymentInfo hands back agents and models in the order they are listed", () => {
  const info = deploymentInfo([lean, chat], [small, big]);
  assert.deepEqual(
    info.agents.map((agent) => agent.name),
    ["lean", "chat"],
  );
  assert.deepEqual(
    info.models.map((model) => model.name),
    ["small", "big"],
  );
});

test("an agent has the model it names, and one that names none has the first model listed", () => {
  assert.deepEqual(deploymentInfo([chat, lean], [big, small]).agents, [
    { name: "chat", model: "big" },
    { name: "lean", model: "small" },
  ]);
});

test("with no models listed, an agent has que's own model, and models is empty", () => {
  assert.deepEqual(deploymentInfo([chat], []), {
    agents: [{ name: "chat", model: OWN_MODEL.name }],
    models: [],
  });
});

test("a model has its name, window and maxTokens, and no provider id", () => {
  assert.deepEqual(deploymentInfo([chat], [big]).models, [
    { name: "big", window: 1_000_000, maxTokens: 100_000 },
  ]);
});

test("with no agents listed, agents is empty", () => {
  assert.deepEqual(deploymentInfo([], [big]).agents, []);
});
