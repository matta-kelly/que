import { test } from "node:test";
import assert from "node:assert/strict";
import { OWN_MODEL, chatModel, modelFor } from "./model.js";

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

test("the model of a run: the one the run names, then its agent's, then the first listed, then que's own", () => {
  const lean = { name: "lean", model: "small" };
  assert.equal(modelFor([big, small], lean, "big"), big);
  assert.equal(modelFor([big, small], lean, undefined), small);
  assert.equal(modelFor([big, small], { name: "chat" }, undefined), big);
  assert.equal(modelFor([], { name: "chat" }, undefined), OWN_MODEL);
});

test("a run that names a model the deployment does not have fails, and the error lists the ones it has", () => {
  assert.throws(
    () => modelFor([big, small], { name: "chat" }, "huge"),
    /no model "huge"\. Models: big, small/,
  );
  assert.throws(
    () => modelFor([], { name: "chat" }, "big"),
    /no model "big"\. This deployment lists no models/,
  );
  assert.throws(() => modelFor([big], { name: "chat" }, 7), /no model 7/);
});

test("the model made for a run has the id and the maxTokens of its config", async () => {
  // The provider's model is made with a key, and none is used: no call goes out.
  process.env.FIREWORKS_API_KEY ??= "none";
  const made = (await chatModel(small)) as unknown as {
    _defaultConfig: Record<string, unknown>;
  };
  assert.equal(made._defaultConfig.modelProvider, "fireworks");
  assert.equal(made._defaultConfig.model, "small-model");
  assert.equal(made._defaultConfig.maxTokens, 8_000);
});

test("the model made for a run is not changed by what the run names", async () => {
  // A run names a model config in `configurable.model`. The framework's model
  // reads that field too, as the provider's model, unless it is told to read none.
  process.env.FIREWORKS_API_KEY ??= "none";
  const made = (await chatModel(small)) as unknown as {
    _modelParams(config: object): Record<string, unknown>;
  };
  assert.deepEqual(
    made._modelParams({
      configurable: { model: "big", modelProvider: "openai" },
    }),
    {},
  );
});
