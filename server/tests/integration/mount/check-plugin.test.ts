/**
 * The mount step of `just check-plugin`: the script it runs first, run as the
 * recipe runs it, against the plugins in fixtures/. A plugin that would not
 * mount on its own fails it with mount's own error; one that mounts passes,
 * and the script prints nothing.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const server = join(import.meta.dirname, "../../..");
const plugin = (name: string) =>
  join(import.meta.dirname, "fixtures/plugins", name);
const work = mkdtempSync(join(tmpdir(), "que-check-plugin-"));
after(() => rmSync(work, { recursive: true, force: true }));

const check = (dir: string) =>
  spawnSync(
    join(server, "node_modules/.bin/tsx"),
    ["harness/src/mount/check-plugin.ts", dir],
    { cwd: server, encoding: "utf8" },
  );

test("a plugin that mounts passes, and nothing is printed", () => {
  const { status, stdout, stderr } = check(plugin("source"));
  assert.equal(status, 0, stderr);
  assert.equal(stdout + stderr, "");
});

test("a domain passes on its own, as what it uses is the deployment's to give", () => {
  const { status, stderr } = check(plugin("domain"));
  assert.equal(status, 0, stderr);
});

test("a folder that holds no plugin fails, as the folder it is given is one", () => {
  const { status, stderr } = check(plugin("hollow"));
  assert.equal(status, 1);
  assert.match(
    stderr,
    /^mount: .*plugins\/hollow holds no plugin \(no io\.github\.matta-kelly\.que\/index\.ts\)$/m,
  );
});

test("a plugin in the old layout fails, saying where que's files go", () => {
  const { status, stderr } = check(plugin("old-layout"));
  assert.equal(status, 1);
  assert.match(
    stderr,
    /^mount: .*plugins\/old-layout: que's files are in io\.github\.matta-kelly\.que\//m,
  );
});

test("a plugin whose card is not what its definition makes fails, saying how to write it", () => {
  const dir = join(work, "stale");
  cpSync(plugin("source"), dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), '{ "type": "module" }\n');
  const card = join(dir, "plugin.json");
  writeFileSync(
    card,
    readFileSync(card, "utf8").replace("A connector,", "A stale connector,"),
  );
  const { status, stderr } = check(dir);
  assert.equal(status, 1);
  assert.match(
    stderr,
    /^mount: .*plugin\.json is not what its definition makes \(from line \d+\): write it with `just card /m,
  );
});

test("a plugin with no card fails, saying how to write it", () => {
  const dir = join(work, "cardless");
  cpSync(plugin("source"), dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), '{ "type": "module" }\n');
  rmSync(join(dir, "plugin.json"));
  const { status, stderr } = check(dir);
  assert.equal(status, 1);
  assert.match(
    stderr,
    /^mount: .*cardless has no card \(plugin\.json\): write it with `just card /m,
  );
});

test("a plugin whose skill breaks the contract fails", () => {
  const { status, stderr } = check(plugin("fileless-skill"));
  assert.equal(status, 1);
  assert.match(
    stderr,
    /^mount: fileless-skill has a folder under skills\/ with no SKILL\.md: ghost\./m,
  );
});
