import { test } from "node:test";
import assert from "node:assert/strict";
import { mountedModel, validateModel } from "./model-spec.js";

const faults = (def: unknown) => {
  try {
    validateModel(def);
  } catch (error) {
    return (error as Error).message;
  }
  return "";
};

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

const lean = { name: "lean", id: "p:m", maxTokens: 5 };

test("validateModel accepts a model with no window, and one with a price", () => {
  assert.equal(faults(lean), "");
  assert.equal(faults({ ...lean, window: 10 }), "");
  assert.equal(faults({ ...lean, price: { input: 0.2, output: 0.8 } }), "");
  assert.equal(
    faults({ ...lean, price: { input: 0, output: 0, cachedInput: 0 } }),
    "",
    "a price of zero is a free model",
  );
});

test("validateModel rejects a price that is not in the shape, naming each fault", () => {
  for (const price of [7, "cheap", null, []])
    assert.match(
      faults({ ...lean, price }),
      /price of the model must be an object/,
      JSON.stringify(price),
    );
  const message = faults({
    ...lean,
    price: { input: -1, cachedInput: "low", perCall: 1 },
  });
  assert.match(
    message,
    /price\.input of the model must be a number of zero or more/,
  );
  assert.match(
    message,
    /price\.output of the model must be a number of zero or more/,
  );
  assert.match(
    message,
    /price\.cachedInput of the model must be a number of zero or more/,
  );
  assert.match(message, /the price of the model has no field "perCall"/);
});

test("validateModel rejects a maxTokens above a written window", () => {
  assert.match(
    faults({ ...lean, window: 4 }),
    /maxTokens of the model must not be above its window/,
  );
});

test("mountedModel takes a value of the file over a fact", () => {
  const facts = { window: 100, price: { input: 1, output: 2 } };
  assert.deepEqual(mountedModel(lean, facts), { ...lean, ...facts });
  const pinned = { ...lean, window: 50, price: { input: 9, output: 9 } };
  assert.deepEqual(mountedModel(pinned, facts), pinned);
  assert.deepEqual(mountedModel(pinned, {}), pinned);
});

test("mountedModel throws, naming the model and the fact, when one is in neither", () => {
  assert.throws(
    () => mountedModel(lean, { price: { input: 1, output: 2 } }),
    /model lean has no window/,
  );
  assert.throws(
    () => mountedModel(lean, { window: 100 }),
    /model lean has no price/,
  );
});

test("mountedModel throws when maxTokens is above the window it ends with", () => {
  assert.throws(
    () => mountedModel(lean, { window: 4, price: { input: 1, output: 2 } }),
    /maxTokens of the model lean must not be above its window, got 5 and 4/,
  );
});
