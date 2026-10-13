import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAgent } from "./agent-spec.js";

test("validateAgent rejects a model that is not a plain name, and says where a model goes for one written as provider:model", () => {
  for (const model of ["two words", 7, null])
    assert.throws(
      () => validateAgent({ name: "chat", model }),
      /model of the agent must be the name of a model/,
      JSON.stringify(model),
    );
  assert.throws(
    () => validateAgent({ name: "chat", model: "fireworks:some-model" }),
    (error: Error) => {
      assert.match(error.message, /a model is a file of its own/);
      assert.match(error.message, /`models`/);
      return true;
    },
  );
});

test("validateAgent accepts a loop, and rejects one that is not a plain name", () => {
  validateAgent({ name: "chat", loop: "deep" });
  for (const loop of ["two words", "", 7, null])
    assert.throws(
      () => validateAgent({ name: "chat", loop }),
      /loop of the agent/,
      JSON.stringify(loop),
    );
});

test("validateAgent rejects a field that is not in the shape, naming it", () => {
  assert.throws(() => validateAgent({ name: "chat", tools: [] }), /tools/);
});

test("validateAgent rejects a package that is not a name", () => {
  assert.throws(() => validateAgent({ packages: [7] }), /packages/);
});

test("validateAgent names every fault in one error", () => {
  assert.throws(
    () =>
      validateAgent({
        loading: "eager",
        packages: "odoo",
        model: "",
        instructions: "",
      }),
    (error: Error) => {
      assert.match(error.message, /loading/);
      assert.match(error.message, /packages/);
      assert.match(error.message, /model/);
      assert.match(error.message, /instructions/);
      return true;
    },
  );
});

test("validateAgent rejects a config with no name, and a name that is not a plain name", () => {
  assert.throws(() => validateAgent({}), /name of the agent is missing/);
  assert.throws(
    () => validateAgent({ name: "two words" }),
    /agent name "two words" must match/,
  );
});

test("validateAgent accepts userInstructions as true or false, and rejects any other value", () => {
  validateAgent({ name: "chat", userInstructions: true });
  validateAgent({ name: "chat", userInstructions: false });
  for (const userInstructions of ["yes", 1, null])
    assert.throws(
      () => validateAgent({ name: "chat", userInstructions }),
      /userInstructions of the agent/,
      JSON.stringify(userInstructions),
    );
});

test("validateAgent rejects the field legibility, and says it is now loading", () => {
  validateAgent({ name: "chat", loading: "on-demand" });
  assert.throws(
    () => validateAgent({ name: "chat", legibility: "on-demand" }),
    /"legibility" is now named `loading`/,
  );
});
