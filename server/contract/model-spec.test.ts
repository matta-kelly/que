import { test } from "node:test";
import assert from "node:assert/strict";
import { defineModel, validateModel } from "./model-spec.js";

const faults = (def: unknown) => {
  try {
    validateModel(def);
  } catch (error) {
    return (error as Error).message;
  }
  return "";
};

test("validateModel accepts a name, an id, a window and a maxTokens", () => {
  validateModel(
    defineModel({
      name: "glm-flash",
      id: "fireworks:accounts/fireworks/models/glm-5p3-flash",
      window: 1_040_000,
      maxTokens: 131_072,
    }),
  );
});

test("validateModel lists each fault in one error, and names the model", () => {
  const message = faults({
    name: "odd",
    id: "glm-5p3-flash",
    window: 0,
    maxTokens: 1.5,
    temperature: 1,
  });
  assert.match(message, /^model odd is invalid/);
  assert.match(message, /id of the model must be in "provider:model" form/);
  assert.match(
    message,
    /window of the model must be a whole number above zero/,
  );
  assert.match(
    message,
    /maxTokens of the model must be a whole number above zero/,
  );
  assert.match(message, /the model has no field "temperature"/);

  const bare = faults({});
  assert.match(bare, /^model is invalid/);
  assert.match(bare, /name of the model is missing/);
  assert.match(bare, /id of the model/);
  assert.match(bare, /window of the model/);
  assert.match(bare, /maxTokens of the model/);

  assert.match(
    faults({ name: "two words", id: "p:m", window: 10, maxTokens: 5 }),
    /model name "two words"/,
  );
  for (const id of [":model", "provider:", "provider: model", 7])
    assert.match(
      faults({ name: "odd", id, window: 10, maxTokens: 5 }),
      /id of the model/,
      JSON.stringify(id),
    );
  assert.match(
    faults({ name: "odd", id: "p:m", window: 10, maxTokens: 11 }),
    /maxTokens of the model must not be above its window/,
  );
  for (const def of [undefined, null, "glm-flash", []])
    assert.match(faults(def), /model must be an object/);
});
