/**
 * The mount step of `just check-deployment`: the script it runs first, run as
 * the recipe runs it, against the deployments in fixtures/. A deployment that
 * would not mount fails it with mount's own error; one that mounts passes, and
 * the script prints the folder of each package it lists. No network: the
 * fixtures are copied to the system's temp folder, so that a test can give a
 * deployment its own saved copy of facts.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mountDeployment } from "../../../harness/src/mount/deployment.js";

const server = join(import.meta.dirname, "../../..");
const fixtures = mkdtempSync(join(tmpdir(), "que-check-deployment-"));
cpSync(join(import.meta.dirname, "fixtures"), fixtures, { recursive: true });
after(() => rmSync(fixtures, { recursive: true, force: true }));
const deployment = (name: string) => join(fixtures, "deployments", name);

const check = (name: string) =>
  spawnSync(
    join(server, "node_modules/.bin/tsx"),
    ["harness/src/mount/check-deployment.ts", deployment(name)],
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

const saveFacts = (name: string, facts: object) => {
  mkdirSync(join(deployment(name), ".que"), { recursive: true });
  writeFileSync(
    join(deployment(name), ".que", "model-facts.json"),
    JSON.stringify(facts),
  );
};

test("a deployment that mounts passes, and the folder of each package it lists is printed", () => {
  const { status, stdout, stderr } = check("agents-two");
  assert.equal(status, 0, stderr);
  assert.deepEqual(stdout.trim().split("\n"), [
    join(fixtures, "packages", "gamma"),
    join(fixtures, "packages", "alpha"),
  ]);
});

// The typos of matta-kelly/que#102 (a path, a package, a loop), and a model, each in a fixture of its own.
for (const [typo, name, says] of [
  [
    "a config path that holds no file",
    "agent-file-missing",
    /nope\.ts holds no agent/,
  ],
  [
    "a package an agent names that is not listed",
    "agent-names-unmounted",
    /names packages the deployment does not mount: delta/,
  ],
  [
    "a loop an agent names that is not listed",
    "agent-loop-unlisted",
    /names the loop "long-chat", which the deployment does not list/,
  ],
  [
    "a model an agent names that is not listed",
    "agent-model-unlisted",
    /names the model "small", which the deployment does not list/,
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

test("a model's window and price come from the saved copy, with no network", () => {
  saveFacts("models-bare", {
    "fireworks:accounts/fireworks/models/bare-model": {
      window: 200_000,
      price: { input: 3, output: 4 },
    },
  });
  const { status, stderr } = check("models-bare");
  assert.equal(status, 0, stderr);
});

test("a fact that is in neither the model file nor the saved copy is unknown, and fails with mount's error", () => {
  saveFacts("models-bare", {
    "fireworks:accounts/fireworks/models/bare-model": { window: 200_000 },
  });
  const { status, stderr } = check("models-bare");
  assert.equal(status, 1);
  assert.match(stderr, /^mount: the model "bare" has no price/);
  // It says the two ways to fix it.
  assert.match(stderr, /`just start` once saves it/);
  assert.match(stderr, /Write `price` in the model file/);
});
