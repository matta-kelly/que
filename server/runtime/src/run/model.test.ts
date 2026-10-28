import { test } from "node:test";
import assert from "node:assert/strict";
import { modelFor } from "./model.js";

const big = {
  name: "big",
  type: "model" as const,
  description: "A model of a test.",
  id: "fireworks:big-model",
  window: 1_000_000,
  maxTokens: 100_000,
  price: { input: 1, output: 2 },
};
const small = {
  name: "small",
  type: "model" as const,
  description: "A model of a test.",
  id: "fireworks:small-model",
  window: 64_000,
  maxTokens: 8_000,
  price: { input: 0.5, output: 1, cachedInput: 0.1 },
};

const chat = {
  name: "chat",
  type: "agent" as const,
  description: "An agent of a test.",
  plugins: [],
  model: "small",
  loop: "long-chat",
};

test("the model of a run: the one the run names, then its agent's, and never the first listed", () => {
  assert.equal(modelFor([big, small], chat, "big"), big);
  assert.equal(modelFor([big, small], chat, undefined), small);
});

test("a run that names a model the deployment does not have fails, and the error lists the ones it has", () => {
  assert.throws(
    () => modelFor([big, small], chat, "huge"),
    /no model "huge"\. Models: big, small/,
  );
  assert.throws(() => modelFor([big], chat, 7), /no model 7/);
});
