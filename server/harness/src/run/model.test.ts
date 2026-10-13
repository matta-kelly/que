import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MODEL, modelFor } from "./model.js";

test("the model is the one the config names, over MODEL", () => {
  assert.equal(
    modelFor({ model: "openai:gpt-config" }, { MODEL: "openai:gpt-env" }),
    "openai:gpt-config",
  );
});

test("with no model in the config, the model is MODEL", () => {
  assert.equal(modelFor({}, { MODEL: "openai:gpt-env" }), "openai:gpt-env");
});

test("with no model in the config and no MODEL, the model is the one named in code", () => {
  assert.equal(modelFor({}, {}), DEFAULT_MODEL);
});

test("the model named in code is the one it was", () => {
  assert.equal(
    DEFAULT_MODEL,
    "fireworks:accounts/fireworks/models/deepseek-v4p1-flash",
  );
});
