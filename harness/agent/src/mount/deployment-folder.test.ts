import { test } from "node:test";
import assert from "node:assert/strict";
import { deploymentFolder } from "./deployment-folder.js";

test("an absolute QUE_DEPLOYMENT is used as it is", () => {
  assert.equal(
    deploymentFolder({ QUE_DEPLOYMENT: "/srv/que/shop" }, "/opt/que/harness"),
    "/srv/que/shop",
  );
});

test("any other QUE_DEPLOYMENT is taken from the base folder", () => {
  assert.equal(
    deploymentFolder(
      { QUE_DEPLOYMENT: "deployments/shop" },
      "/opt/que/harness",
    ),
    "/opt/que/harness/deployments/shop",
  );
});

test("stops, naming QUE_DEPLOYMENT, when it is not set", () => {
  assert.throws(
    () => deploymentFolder({}, "/opt/que/harness"),
    /QUE_DEPLOYMENT/,
  );
});

test("stops, naming QUE_DEPLOYMENT, when it is blank", () => {
  assert.throws(
    () => deploymentFolder({ QUE_DEPLOYMENT: "  " }, "/opt/que/harness"),
    /QUE_DEPLOYMENT/,
  );
});
