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
  const { status, stdout, stderr } = check("agents-two");
  assert.equal(status, 0, stderr);
  assert.deepEqual(stdout.trim().split("\n"), [
    realpathSync(join(deployment("agents-two"), "plugins", "gamma")),
    realpathSync(join(deployment("agents-two"), "plugins", "alpha")),
  ]);
});

// The typos of matta-kelly/que#102 (a path, a plugin, a loop), a model, and a model with no window, each in a fixture of its own.
for (const [typo, name, says] of [
  [
    "an agent no file gives",
    "agent-file-missing",
    /\/agents: names the agent nope, which no file in the deployment's agents\/ gives/,
  ],
  [
    "a plugin an agent names that the deployment does not mount",
    "agent-names-unmounted",
    /names the plugin delta, which the deployment does not mount/,
  ],
  [
    "a loop an agent names that the deployment does not give",
    "agent-loop-unlisted",
    /names the loop long-chat, which no file in the deployment's loops\/ gives/,
  ],
  [
    "a name a domain uses that the deployment does not give",
    "uses-unresolved",
    /stray\/io\.github\.matta-kelly\.que\/index\.ts: \/usesOps: It points at source-lose, which is not a node\./,
  ],
  [
    "a model an agent names that the deployment does not give",
    "agent-model-unlisted",
    /names the model small, which no file in the deployment's models\/ gives/,
  ],
  [
    "a model the model catalog has no entry for, whose file writes no window",
    "models-bare",
    /models\/bare\.ts: \/window: Missing: .*\(basis\/fields\)/,
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
