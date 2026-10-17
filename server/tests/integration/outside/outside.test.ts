/**
 * Mount, from a folder that is not inside que: a deployment that holds its
 * own package. The fixtures are copied to the system's temp folder first, so
 * that nothing above them can supply `@que/core`.
 * The type check of such a folder, as `just check-folder` runs it, is here too:
 * its package imports each name que supplies.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDeployment } from "../../../harness/src/mount/deployment.js";
import { mountPackages } from "../../../harness/src/mount/packages.js";
import { checkConfig } from "../../../harness/src/mount/supplied.js";

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

test("a deployment outside que type checks with the tsconfig `just check-folder` writes", () => {
  const tsconfig = join(outside, "tsconfig.json");
  writeFileSync(
    tsconfig,
    JSON.stringify(checkConfig([join(outside, "deployment")])),
  );
  const tsc = join(import.meta.dirname, "../../../node_modules/.bin/tsc");
  try {
    execFileSync(tsc, ["--noEmit", "-p", tsconfig], { encoding: "utf8" });
  } catch (error) {
    assert.fail((error as { stdout: string }).stdout);
  }
});
