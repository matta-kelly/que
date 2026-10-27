/**
 * Mount, from a folder that is not inside que: a deployment that holds its
 * own plugin. The fixtures are copied to the system's temp folder first, so
 * that nothing above them can supply `@que/plugin` or `@que/core`.
 * The type check of such a folder, as `just check-folder` runs it, is here too:
 * its plugin imports each name que supplies.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDeployment } from "../../../harness/src/mount/deployment.js";
import { mountPlugins } from "../../../harness/src/mount/plugins.js";
import { checkConfig } from "../../../harness/src/mount/supplied.js";

const outside = mkdtempSync(join(tmpdir(), "que-outside-"));
cpSync(join(import.meta.dirname, "fixtures"), outside, { recursive: true });
after(() => rmSync(outside, { recursive: true, force: true }));

const mount = async (deployment: string) =>
  mountPlugins((await loadDeployment(join(outside, deployment))).plugins);

test("que mounts a deployment and its plugin from a folder outside que", async () => {
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
    // No output means tsc did not run: the error says why.
    assert.fail((error as { stdout?: string }).stdout || String(error));
  }
});
