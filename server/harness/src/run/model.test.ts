import { test } from "node:test";
import assert from "node:assert/strict";
import { ChatBeam } from "./beam.js";
import { chatModel, modelFor } from "./model.js";

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

const chat = { name: "chat", packages: [], model: "small", loop: "long-chat" };

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

test("the model made for a beam config is Beam's, with the id and the maxTokens of its config", async () => {
  // The model is made with a key, and none is used: no call goes out.
  process.env.BEAM_API_KEY ??= "none";
  const made = await chatModel({
    name: "beam",
    id: "beam:Beam-1.0-501B-A23B",
    window: 1_048_576,
    maxTokens: 131_072,
    price: { input: 0, output: 0 },
  });
  assert.ok(made instanceof ChatBeam);
  assert.equal(made.model, "Beam-1.0-501B-A23B");
  assert.equal(made.maxTokens, 131_072);
});

test("the model made for a config sends the config's effort as reasoning_effort", async () => {
  process.env.FIREWORKS_API_KEY ??= "none";
  process.env.BEAM_API_KEY ??= "none";
  // What a request is built from: the framework's model, and the request's params.
  const fireworks = (await chatModel({
    ...small,
    effort: "low",
  })) as unknown as {
    _getModelInstance(config: object): Promise<{
      invocationParams(options: object): Record<string, unknown>;
    }>;
  };
  assert.equal(
    (await fireworks._getModelInstance({})).invocationParams({})
      .reasoning_effort,
    "low",
  );
  const beam = await chatModel({
    name: "beam",
    id: "beam:Beam-1.0-501B-A23B",
    window: 1_048_576,
    maxTokens: 131_072,
    price: { input: 0, output: 0 },
    effort: "high",
  });
  assert.ok(beam instanceof ChatBeam);
  assert.equal(beam.invocationParams({}).reasoning_effort, "high");
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
