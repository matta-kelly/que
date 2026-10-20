import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDeployment } from "./deployment.js";

test("validateDeployment names every problem in one error", () => {
  assert.throws(
    () => validateDeployment({ name: "two words", plugins: [""] }),
    (error: Error) => {
      assert.match(error.message, /deployment is invalid/);
      assert.match(error.message, /- name must match/);
      assert.match(
        error.message,
        /- plugins\.0 must be a plugin folder or the name of its npm package, got ""/,
      );
      return true;
    },
  );
  assert.throws(
    () => validateDeployment({ name: "", plugins: "./odoo" }),
    (error: Error) => {
      assert.match(error.message, /deployment is invalid/);
      assert.match(error.message, /- name is missing/);
      assert.match(error.message, /- plugins must be an array/);
      return true;
    },
  );
});

test("validateDeployment rejects a field that is not in the shape, naming it", () => {
  assert.throws(
    () =>
      validateDeployment({
        name: "shop",
        plugins: [],
        agents: ["./chat.ts"],
        loops: ["./long-chat.ts"],
        models: ["./small.ts"],
        model: "provider:model",
      }),
    /deployment shop is invalid:\n- has no field "model"/,
  );
});

test("validateDeployment says so when there is no definition", () => {
  for (const def of [undefined, null, "shop", []])
    assert.throws(
      () => validateDeployment(def),
      /deployment is invalid:\n- no definition \(default export\)/,
    );
});

test("validateDeployment rejects agents that are not a list, and an agent that is not a file path", () => {
  assert.throws(
    () =>
      validateDeployment({ name: "shop", plugins: [], agents: "./chat.ts" }),
    /- agents must be an array/,
  );
  assert.throws(
    () => validateDeployment({ name: "shop", plugins: [], agents: [7, " "] }),
    (error: Error) => {
      assert.match(error.message, /- agents\.0 must be a file path, got 7/);
      assert.match(error.message, /- agents\.1 must be a file path, got " "/);
      return true;
    },
  );
});

test("validateDeployment rejects an agent block, and says a config is now a file", () => {
  assert.throws(
    () =>
      validateDeployment({
        name: "shop",
        plugins: [],
        agent: { model: "provider:model" },
      }),
    /deployment shop is invalid:\n(- .*\n)*- has an `agent` block: an agent config is a file of its own, listed in `agents`/,
  );
});

test("validateDeployment rejects a deployment that lists no agent, no loop or no model, left out or empty", () => {
  const full = {
    name: "shop",
    plugins: [],
    agents: ["./chat.ts"],
    loops: ["./long-chat.ts"],
    models: ["./small.ts"],
  };
  for (const [list, one] of [
    ["agents", "agent"],
    ["loops", "loop"],
    ["models", "model"],
  ]) {
    assert.throws(
      () => validateDeployment({ ...full, [list]: undefined }),
      new RegExp(`- ${list} is missing: list at least one ${one} config`),
    );
    assert.throws(
      () => validateDeployment({ ...full, [list]: [] }),
      new RegExp(`- ${list} is empty: list at least one ${one} config`),
    );
  }
  validateDeployment(full);
});

test("validateDeployment rejects a deployment that leaves out its plugins, and takes `[]` as none", () => {
  const shop = {
    name: "shop",
    agents: ["./chat.ts"],
    loops: ["./long-chat.ts"],
    models: ["./small.ts"],
  };
  assert.throws(
    () => validateDeployment(shop),
    /deployment shop is invalid:\n- plugins is missing: list the plugins it uses, or `\[\]` for none/,
  );
  validateDeployment({ ...shop, plugins: [] });
});

test("validateDeployment rejects the field packages, and says it is now plugins", () => {
  assert.throws(
    () =>
      validateDeployment({
        name: "shop",
        plugins: [],
        packages: ["./odoo"],
        agents: ["./chat.ts"],
        loops: ["./long-chat.ts"],
        models: ["./small.ts"],
      }),
    /deployment shop is invalid:\n- the field "packages" is now named `plugins`/,
  );
});
