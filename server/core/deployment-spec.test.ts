import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDeployment } from "./deployment-spec.js";

test("validateDeployment names every problem in one error", () => {
  assert.throws(
    () => validateDeployment({ name: "two words", packages: [""] }),
    (error: Error) => {
      assert.match(error.message, /deployment is invalid/);
      assert.match(error.message, /- name must match/);
      assert.match(
        error.message,
        /- packages\.0 must be a folder path, got ""/,
      );
      return true;
    },
  );
  assert.throws(
    () => validateDeployment({ name: "", packages: "./odoo" }),
    (error: Error) => {
      assert.match(error.message, /deployment is invalid/);
      assert.match(error.message, /- name is missing/);
      assert.match(error.message, /- packages must be an array/);
      return true;
    },
  );
});

test("validateDeployment rejects a field that is not in the shape, naming it", () => {
  assert.throws(
    () =>
      validateDeployment({
        name: "shop",
        packages: [],
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
      validateDeployment({ name: "shop", packages: [], agents: "./chat.ts" }),
    /- agents must be an array/,
  );
  assert.throws(
    () => validateDeployment({ name: "shop", packages: [], agents: [7, " "] }),
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
        packages: [],
        agent: { model: "provider:model" },
      }),
    /deployment shop is invalid:\n(- .*\n)*- has an `agent` block: an agent config is a file of its own, listed in `agents`/,
  );
});

test("validateDeployment rejects a deployment that lists no agent, no loop or no model, left out or empty", () => {
  const full = {
    name: "shop",
    packages: [],
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
