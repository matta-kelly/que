/**
 * Mount, from a folder that is not inside que: a deployment that holds its
 * own package. The fixtures are copied to the system's temp folder first, so
 * that nothing above them can supply `@que/core`.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDeployment } from "../../../harness/src/mount/deployment.js";
import { mountPackages } from "../../../harness/src/mount/packages.js";

const outside = mkdtempSync(join(tmpdir(), "que-outside-"));
cpSync(join(import.meta.dirname, "fixtures"), outside, { recursive: true });
after(() => rmSync(outside, { recursive: true, force: true }));

const mount = async (deployment: string) =>
  mountPackages((await loadDeployment(join(outside, deployment))).packages);

test("que mounts a deployment and its package from a folder outside que", async () => {
  const mounted = await mount("deployment");
  assert.deepEqual(
    mounted.map((p) => p.definition.name),
    ["notes"],
  );
});
