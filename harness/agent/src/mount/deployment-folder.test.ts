import { test } from "node:test";
import assert from "node:assert/strict";
import { deploymentFolder } from "./deployment-folder.js";

test("an absolute QUE_DEPLOYMENT is used as it is", () => {
  assert.equal(
    deploymentFolder({ QUE_DEPLOYMENT: "/srv/que/shop" }),
    "/srv/que/shop",
  );
});

test("stops, naming the path, when QUE_DEPLOYMENT is not absolute", () => {
  assert.throws(
    () => deploymentFolder({ QUE_DEPLOYMENT: "deployments/shop" }),
    /absolute path, got "deployments\/shop"/,
  );
});

test("stops, naming QUE_DEPLOYMENT, when it is not set", () => {
  assert.throws(() => deploymentFolder({}), /QUE_DEPLOYMENT is not set/);
});

test("stops, naming QUE_DEPLOYMENT, when it is blank", () => {
  assert.throws(
    () => deploymentFolder({ QUE_DEPLOYMENT: "  " }),
    /QUE_DEPLOYMENT is not set/,
  );
});
