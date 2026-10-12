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
