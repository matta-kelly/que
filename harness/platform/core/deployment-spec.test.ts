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

test("validateDeployment names every problem in one error", () => {
  assert.throws(
    () =>
      validateDeployment({
        name: "not a name",
        packages: ["../packages/orders", ""],
      }),
    (error: Error) => {
      assert.match(error.message, /name/);
      assert.match(error.message, /packages/);
      return true;
    },
  );
});

test("validateDeployment rejects packages that are not a list", () => {
  assert.throws(
    () => validateDeployment({ name: "shop", packages: "orders" } as never),
    /packages/,
  );
});

test("validateDeployment rejects a missing definition", () => {
  assert.throws(() => validateDeployment(undefined));
});
