/**
 * The mount step of `just check-deployment`: the script it runs first, run as
 * the recipe runs it, against the deployments in fixtures/, each a root of its
 * own (deploymentRoot). A deployment that would not mount fails it with
 * mount's own error; one that mounts passes, and the script prints the folder
 * of each plugin it lists. No network: a model's facts are its file's, or the
 * installed model catalog's.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { mountDeployment } from "../../../runtime/src/mount/deployment.js";
import { deploymentRoot } from "../../deployment-root.js";

const server = join(import.meta.dirname, "../../..");
const deployment = (name: string) =>
  deploymentRoot(join(import.meta.dirname, "fixtures"), name);

const check = (name: string) =>
  spawnSync(
    join(server, "node_modules/.bin/tsx"),
    ["runtime/src/mount/check-deployment.ts", deployment(name)],
    { cwd: server, encoding: "utf8" },
  );

/** The error mount stops with, for the deployment. */
const mountError = async (name: string) => {
  try {
    await mountDeployment(deployment(name));
  } catch (error) {
    return (error as Error).message;
  }
  assert.fail(`${name} mounts`);
};

test("a deployment that mounts passes, and the folder of each plugin it lists is printed", () => {
  const { status, stdout, stderr } = check("two");
  assert.equal(status, 0, stderr);
  assert.deepEqual(stdout.trim().split("\n"), [
    realpathSync(join(deployment("two"), "plugins", "gamma")),
    realpathSync(join(deployment("two"), "plugins", "alpha")),
  ]);
});

// A typo in what a deployment uses, and a plugin it names that is not installed, each in a fixture of its own.
for (const [typo, name, says] of [
  [
    "a name a domain uses that the deployment does not give",
    "uses-unresolved",
    /stray\/skills\/stray-guide\/SKILL\.md: \/uses: It points at source-lose, which is not a node\./,
  ],
  [
    "a plugin that is not installed",
    "missing",
    /The plugin nope is not installed/,
  ],
] as const) {
  test(`fails with mount's error on ${typo}`, async () => {
    const { status, stdout, stderr } = check(name);
    assert.equal(status, 1);
    assert.equal(stdout, "");
    assert.match(stderr, says);
    assert.equal(stderr.trim(), await mountError(name));
  });
}
