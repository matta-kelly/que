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

test("validateDeployment accepts a deployment with no agent", () => {
  validateDeployment(defineDeployment({ name: "shop", packages: [] }));
});

test("validateDeployment accepts a deployment with an empty agent", () => {
  validateDeployment(
    defineDeployment({ name: "shop", packages: [], agent: {} }),
  );
});

test("validateDeployment rejects an agent that breaks its shape", () => {
  assert.throws(
    () =>
      validateDeployment({ name: "shop", packages: [], agent: { model: "" } }),
    /model/,
  );
});

test("validateDeployment names the agent's faults beside its own, in one error", () => {
  assert.throws(
    () =>
      validateDeployment({
        name: "two words",
        packages: [],
        agent: { model: "", instructions: "" },
      }),
    (error: Error) => {
      assert.match(error.message, /name/);
      assert.match(error.message, /model/);
      assert.match(error.message, /instructions/);
      return true;
    },
  );
});
