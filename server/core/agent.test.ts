import { test } from "node:test";
import assert from "node:assert/strict";
import { LOADING, validateAgent } from "./agent.js";

test("validateAgent rejects a model that is not the name of a model, as one written as provider:model is not", () => {
  for (const [model, message] of [
    ["two words", "Not a lowercase slug."],
    ["fireworks:some-model", "Not a lowercase slug."],
    [7, "Invalid input: expected string, received number"],
    [null, "Invalid input: expected string, received null"],
  ] as const)
    assert.throws(
      () => validateAgent({ name: "chat", model }),
      new RegExp(`- model ${message.replace(".", "\\.")}`),
      JSON.stringify(model),
    );
});

test("validateAgent accepts a loop, and rejects one that is not a plain name", () => {
  validateAgent({
    name: "chat",
    plugins: [],
    model: "small",
    loop: "long-chat",
  });
  for (const loop of ["two words", "", 7, null])
    assert.throws(
      () => validateAgent({ name: "chat", loop }),
      /- loop /,
      JSON.stringify(loop),
    );
});

test("validateAgent rejects a field that is not in the shape, naming it", () => {
  assert.throws(
    () => validateAgent({ name: "chat", tools: [] }),
    /- has no field "tools"/,
  );
});

test("validateAgent rejects a package that is not a name", () => {
  assert.throws(
    () => validateAgent({ name: "chat", plugins: [7] }),
    /- plugins\.0 Invalid input: expected string, received number/,
  );
});

test("validateAgent names every fault in one error", () => {
  assert.throws(
    () =>
      validateAgent({
        loading: "lazy",
        plugins: "odoo",
        model: "",
        instructions: "",
      }),
    (error: Error) => {
      assert.match(error.message, /agent is invalid/);
      assert.match(error.message, /- name is missing/);
      assert.match(
        error.message,
        /- loading must be one of: on-demand, eager, got "lazy"/,
      );
      assert.match(
        error.message,
        /- plugins Invalid input: expected array, received string/,
      );
      assert.match(error.message, /- model Not a lowercase slug\./);
      assert.match(
        error.message,
        /- instructions must be text that is not empty, got ""/,
      );
      assert.match(
        error.message,
        /- loop Invalid input: expected string, received undefined/,
      );
      return true;
    },
  );
});

test("validateAgent rejects what is not an object, a config with no name, and a name that is not a plain name", () => {
  for (const def of [undefined, null, "chat", []])
    assert.throws(
      () => validateAgent(def),
      /agent is invalid:\n- must be an object/,
    );
  assert.throws(
    () => validateAgent({}),
    /agent is invalid:\n- name is missing/,
  );
  assert.throws(
    () => validateAgent({ name: "two words" }),
    /- name must be lowercase letters and digits, with single hyphens between them, got "two words"/,
  );
});

test("validateAgent accepts userInstructions as true or false, and rejects any other value", () => {
  validateAgent({
    name: "chat",
    plugins: [],
    model: "small",
    loop: "long-chat",
    userInstructions: true,
  });
  validateAgent({
    name: "chat",
    plugins: [],
    model: "small",
    loop: "long-chat",
    userInstructions: false,
  });
  for (const userInstructions of ["yes", 1, null])
    assert.throws(
      () => validateAgent({ name: "chat", userInstructions }),
      /- userInstructions must be true or false/,
      JSON.stringify(userInstructions),
    );
});

test("validateAgent accepts each way of loading", () => {
  for (const loading of LOADING)
    validateAgent({
      name: "chat",
      plugins: [],
      model: "small",
      loop: "long-chat",
      loading,
    });
});

test("validateAgent rejects the field legibility, and says it is now loading", () => {
  validateAgent({
    name: "chat",
    plugins: [],
    model: "small",
    loop: "long-chat",
    loading: "on-demand",
  });
  assert.throws(
    () => validateAgent({ name: "chat", legibility: "on-demand" }),
    /"legibility" is now named `loading`/,
  );
});

test("validateAgent rejects an agent that leaves out plugins, and takes `[]` as none", () => {
  assert.throws(
    () => validateAgent({ name: "chat" }),
    /- plugins Invalid input: expected array, received undefined/,
  );
  validateAgent({
    name: "chat",
    plugins: [],
    model: "small",
    loop: "long-chat",
  });
  validateAgent({
    name: "chat",
    plugins: ["odoo", "notes"],
    model: "small",
    loop: "long-chat",
  });
});

test("validateAgent rejects an agent that names no model or no loop", () => {
  assert.throws(
    () => validateAgent({ name: "chat", plugins: [], loop: "long-chat" }),
    /- model Invalid input: expected string, received undefined/,
  );
  assert.throws(
    () => validateAgent({ name: "chat", plugins: [], model: "small" }),
    /- loop Invalid input: expected string, received undefined/,
  );
});

test("validateAgent rejects the field packages, and says it is now plugins", () => {
  assert.throws(
    () =>
      validateAgent({
        name: "chat",
        plugins: [],
        packages: ["odoo"],
        model: "small",
        loop: "long-chat",
      }),
    /agent chat is invalid:\n- the field "packages" is now named `plugins`/,
  );
});

test("validateAgent refuses an old config that gives packages alone, with plugins missing and the hint", () => {
  assert.throws(
    () =>
      validateAgent({
        name: "chat",
        packages: ["odoo"],
        model: "small",
        loop: "long-chat",
      }),
    (error: Error) => {
      assert.match(
        error.message,
        /- plugins Invalid input: expected array, received undefined/,
      );
      assert.match(
        error.message,
        /- the field "packages" is now named `plugins`/,
      );
      return true;
    },
  );
});
