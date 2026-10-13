import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAgent } from "./agent-spec.js";

test("validateAgent accepts a name, packages, a model, instructions and a legibility", () => {
  validateAgent({
    name: "chat",
    packages: ["odoo"],
    model: "glm-flash",
    instructions: "You help the sales team.",
    legibility: "on-demand",
    loop: "long-chat",
  });
});

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

test("validateAgent accepts a config with only a name", () => {
  validateAgent({ name: "chat" });
});

test("validateAgent rejects a field that is not in the shape, naming it", () => {
  assert.throws(() => validateAgent({ name: "chat", tools: [] }), /tools/);
});

test("validateAgent rejects packages that are not a list", () => {
  assert.throws(() => validateAgent({ packages: "odoo" }), /packages/);
});

test("validateAgent rejects a package that is not a name", () => {
  assert.throws(() => validateAgent({ packages: [7] }), /packages/);
});

test("validateAgent rejects an empty model", () => {
  assert.throws(() => validateAgent({ model: "" }), /model/);
});

test("validateAgent rejects empty instructions", () => {
  assert.throws(() => validateAgent({ instructions: "" }), /instructions/);
});

test("validateAgent names every fault in one error", () => {
  assert.throws(
    () =>
      validateAgent({
        legibility: "eager",
        packages: "odoo",
        model: "",
        instructions: "",
      }),
    (error: Error) => {
      assert.match(error.message, /legibility/);
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

test("validateAgent rejects a legibility que does not have, and lists the ones it has", () => {
  assert.throws(
    () => validateAgent({ name: "chat", legibility: "by-magic" }),
    /legibility of the agent must be one of: on-demand, got "by-magic"/,
  );
});

test("validateAgent names the config in its error", () => {
  assert.throws(
    () => validateAgent({ name: "chat", model: "" }),
    (error: Error) => {
      assert.match(error.message, /^agent chat is invalid/);
      return true;
    },
  );
});
