import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDeployment, validateDeployment } from "./deployment-spec.js";

test("validateDeployment accepts a name and a list of package folders", () => {
  validateDeployment(
    defineDeployment({
      name: "shop",
      packages: ["../packages/orders", "/srv/packages/stock"],
    }),
  );
});

test("validateDeployment accepts a deployment with no packages", () => {
  validateDeployment(defineDeployment({ name: "empty", packages: [] }));
});

test("validateDeployment rejects a missing name", () => {
  assert.throws(() => validateDeployment({ packages: [] }), /name/);
});

test("validateDeployment rejects a name that is not a plain name", () => {
  assert.throws(
    () => validateDeployment({ name: "two words", packages: [] }),
    /name/,
  );
});

test("validateDeployment rejects packages that are not a list", () => {
  assert.throws(
    () => validateDeployment({ name: "shop", packages: "orders" }),
    /packages/,
  );
});

test("validateDeployment rejects a package folder that is not a string", () => {
  assert.throws(
    () => validateDeployment({ name: "shop", packages: [7] }),
    /packages/,
  );
});

test("validateDeployment rejects an empty package folder", () => {
  assert.throws(
    () => validateDeployment({ name: "shop", packages: [""] }),
    /packages/,
  );
});

test("validateDeployment names every problem in one error", () => {
  assert.throws(
    () => validateDeployment({ name: "two words", packages: [""] }),
    (error: Error) => {
      assert.match(error.message, /name/);
      assert.match(error.message, /packages/);
      return true;
    },
  );
});

test("validateDeployment says so when there is no definition", () => {
  assert.throws(() => validateDeployment(undefined), /no definition/);
});

test("validateDeployment says so when the definition is null", () => {
  assert.throws(() => validateDeployment(null), /no definition/);
});

test("validateDeployment rejects a package folder of only spaces", () => {
  assert.throws(
    () => validateDeployment({ name: "shop", packages: ["  "] }),
    /packages/,
  );
});

test("validateDeployment accepts a deployment with no agents", () => {
  validateDeployment(defineDeployment({ name: "shop", packages: [] }));
});

test("validateDeployment accepts a deployment that lists agent files", () => {
  validateDeployment(
    defineDeployment({
      name: "shop",
      packages: [],
      agents: ["./agents/chat.ts", "/abs/agents/lean.ts"],
    }),
  );
});

test("validateDeployment rejects agents that are not a list, and an agent that is not a file path", () => {
  assert.throws(
    () =>
      validateDeployment({ name: "shop", packages: [], agents: "./chat.ts" }),
    /agents of deployment shop must be an array/,
  );
  assert.throws(
    () => validateDeployment({ name: "shop", packages: [], agents: [7, " "] }),
    (error: Error) => {
      assert.match(error.message, /must each be a file path, got 7/);
      assert.match(error.message, /must each be a file path, got " "/);
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
    /deployment shop has an `agent` block: an agent config is a file of its own, listed in `agents`/,
  );
});

test("validateDeployment accepts a deployment that lists loop files, and one with none", () => {
  validateDeployment(defineDeployment({ name: "shop", packages: [] }));
  validateDeployment(
    defineDeployment({
      name: "shop",
      packages: [],
      loops: ["./loops/nightly.ts", "/abs/loops/long-chat.ts"],
    }),
  );
});

test("validateDeployment rejects loops that are not a list, and a loop that is not a file path", () => {
  assert.throws(
    () =>
      validateDeployment({ name: "shop", packages: [], loops: "./nightly.ts" }),
    /loops of deployment shop must be an array/,
  );
  assert.throws(
    () => validateDeployment({ name: "shop", packages: [], loops: [7, " "] }),
    (error: Error) => {
      assert.match(
        error.message,
        /loops of deployment shop must each be a file path, got 7/,
      );
      assert.match(
        error.message,
        /loops of deployment shop must each be a file path, got " "/,
      );
      return true;
    },
  );
});

test("validateDeployment accepts model files, and rejects models that are not a list of file paths", () => {
  validateDeployment(
    defineDeployment({
      name: "shop",
      packages: [],
      models: ["./models/small.ts", "/abs/models/glm-flash.ts"],
    }),
  );
  assert.throws(
    () =>
      validateDeployment({ name: "shop", packages: [], models: "./small.ts" }),
    /models of deployment shop must be an array/,
  );
  assert.throws(
    () => validateDeployment({ name: "shop", packages: [], models: [7] }),
    /models of deployment shop must each be a file path, got 7/,
  );
});
