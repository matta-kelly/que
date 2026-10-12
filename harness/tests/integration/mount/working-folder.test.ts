/**
 * Mount, started from a folder that is not harness/. Its own file, since the
 * working folder is set for the whole process. The mount code is loaded after
 * the move, the way a server started elsewhere would load it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";

test("takes QUE_DEPLOYMENT from harness/, whatever the working folder is", async () => {
  process.chdir(tmpdir());
  const { mountFromEnv } =
    await import("../../../agent/src/mount/deployment.js");
  const mounted = await mountFromEnv({ QUE_DEPLOYMENT: "deployments/landl" });
  assert.deepEqual(
    mounted.map((p) => p.definition.name),
    ["odoo"],
  );
});
