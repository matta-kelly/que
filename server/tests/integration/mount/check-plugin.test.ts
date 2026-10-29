/**
 * The mount step of `just check-plugin`: the script it runs first, run as the
 * recipe runs it, against the plugins in fixtures/. A plugin mounted on its own
 * is linted from its root: each of these is a root of its own, with its
 * basis.config.ts. A plugin that would not mount on its own fails it with
 * mount's own error; one that mounts passes, and the script prints nothing.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
    ["runtime/src/mount/check-plugin.ts", dir],
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

test("a plugin passes whatever its folder's plugin.json holds, as no card is read", () => {
  const dir = join(work, "carded");
  cpSync(plugin("source"), dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), '{ "type": "module" }\n');
  writeFileSync(join(dir, "plugin.json"), "not a card\n");
  const { status, stderr } = check(dir);
  assert.equal(status, 0, stderr);
});

test("a plugin whose skill breaks the contract fails", () => {
  const { status, stderr } = check(plugin("fileless-skill"));
  assert.equal(status, 1);
  assert.match(
    stderr,
    /skills\/ghost\/SKILL\.md: The skill cannot be read: skills\/ghost has no SKILL\.md\./,
  );
});

test("a plugin whose case names a capability the plugin does not hold fails", () => {
  const { status, stderr } = check(plugin("bad-cases"));
  assert.equal(status, 1);
  assert.match(
    stderr,
    /cases\.ts#refund-asked: \/capability: It points at refund, which is not a node\. \(basis\/link\)/,
  );
});

test("a plugin in no root fails, naming its folder and saying how it gets one", () => {
  const dir = join(work, "rootless");
  cpSync(plugin("source"), dir, { recursive: true });
  rmSync(join(dir, "basis.config.ts"));
  writeFileSync(join(dir, "package.json"), '{ "type": "module" }\n');
  const { status, stderr } = check(dir);
  assert.equal(status, 1);
  assert.match(stderr, new RegExp(`^mount: ${dir} is in no root:`, "m"));
  assert.match(stderr, /pluginSchema/);
});
