import { test } from "node:test";
import assert from "node:assert/strict";
import { LOADING, validateAgent } from "./agent-spec.js";

test("validateAgent rejects a model that is not a plain name, and says where a model goes for one written as provider:model", () => {
  for (const model of ["two words", 7, null])
    assert.throws(
      () => validateAgent({ name: "chat", model }),
      /- model must be the name of a model, got/,
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
  validateAgent({
    name: "chat",
    packages: [],
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
    () => validateAgent({ name: "chat", packages: [7] }),
    /- packages\.0 must be a package name, got 7/,
  );
});

test("validateAgent names every fault in one error", () => {
  assert.throws(
    () =>
      validateAgent({
        loading: "lazy",
        packages: "odoo",
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
      assert.match(error.message, /- packages must be an array, got "odoo"/);
      assert.match(
        error.message,
        /- model must be the name of a model, got ""/,
      );
      assert.match(
        error.message,
        /- instructions must be text that is not empty, got ""/,
      );
      assert.match(error.message, /- loop is missing/);
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
    /- name must match/,
  );
});

test("validateAgent accepts userInstructions as true or false, and rejects any other value", () => {
  validateAgent({
    name: "chat",
    packages: [],
    model: "small",
    loop: "long-chat",
    userInstructions: true,
  });
  validateAgent({
    name: "chat",
    packages: [],
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
      packages: [],
      model: "small",
      loop: "long-chat",
      loading,
    });
});

test("validateAgent rejects the field legibility, and says it is now loading", () => {
  validateAgent({
    name: "chat",
    packages: [],
    model: "small",
    loop: "long-chat",
    loading: "on-demand",
  });
  assert.throws(
    () => validateAgent({ name: "chat", legibility: "on-demand" }),
    /"legibility" is now named `loading`/,
  );
});

test("validateAgent rejects an agent that leaves out packages, and takes `[]` as none", () => {
  assert.throws(
    () => validateAgent({ name: "chat" }),
    /- packages is missing: list the packages it gets, or `\[\]` for none/,
  );
  validateAgent({
    name: "chat",
    packages: [],
    model: "small",
    loop: "long-chat",
  });
  validateAgent({
    name: "chat",
    packages: ["odoo", "notes"],
    model: "small",
    loop: "long-chat",
  });
});

test("validateAgent rejects an agent that names no model or no loop", () => {
  assert.throws(
    () => validateAgent({ name: "chat", packages: [], loop: "long-chat" }),
    /- model is missing: name a model config the deployment lists/,
  );
  assert.throws(
    () => validateAgent({ name: "chat", packages: [], model: "small" }),
    /- loop is missing: name a loop config the deployment lists/,
  );
});
