/**
 * The mount que does at startup, through the module the agent, the API and
 * the evals share. Its own file: the module mounts once for the whole process,
 * from the environment as it is when the module first loads.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

test("que mounts, at startup, the deployment the environment names", async () => {
  process.env.QUE_DEPLOYMENT = join(
    import.meta.dirname,
    "fixtures/deployments/two",
  );
  const { packages } = await import("../../../agent/src/mount/mounted.js");
  assert.deepEqual(
    packages.map((p) => p.definition.name),
    ["gamma", "alpha"],
  );
});
