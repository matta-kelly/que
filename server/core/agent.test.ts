import { test } from "node:test";
import assert from "node:assert/strict";
import { LOADING, validateAgent } from "./agent.js";
import { pluginsOf } from "./plugin.js";

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
    /- plugins\.0 must be a plugin name, got 7/,
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
      assert.match(error.message, /- plugins must be an array, got "odoo"/);
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
    /- plugins is missing: list the plugins it gets, or `\[\]` for none/,
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
    /- model is missing: name a model config the deployment lists/,
  );
  assert.throws(
    () => validateAgent({ name: "chat", plugins: [], model: "small" }),
    /- loop is missing: name a loop config the deployment lists/,
  );
});

test("validateAgent takes packages, the old name of plugins, and refuses an agent that gives both", () => {
  const chat = { name: "chat", model: "small", loop: "long-chat" };
  validateAgent({ ...chat, packages: ["odoo"] });
  assert.deepEqual(pluginsOf({ ...chat, packages: ["odoo"] }), ["odoo"]);
  assert.deepEqual(pluginsOf({ ...chat, plugins: ["odoo"] }), ["odoo"]);
  assert.throws(
    () => validateAgent({ ...chat, plugins: ["odoo"], packages: ["odoo"] }),
    /agent chat is invalid:\n- packages is the old name of plugins: give plugins only/,
  );
});
