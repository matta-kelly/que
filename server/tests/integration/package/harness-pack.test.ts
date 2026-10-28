/**
 * The contract of `@mku1tra/que-harness` on npm: what its tarball holds, and that a folder with no que in it installs
 * the tarball, imports it by name and runs its command. The pack builds `harness/dist/`, which this test removes again:
 * no other step builds it. The folder is in the system's temp folder, so nothing of que is above it, and its Node runs
 * with no condition and no tsx. Its peer @mku1tra/que-plugin is que's own, packed beside it from a copy of
 * server/plugin, so the two are checked together before either is published; basis and zod come from npm.
 */

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const server = join(import.meta.dirname, "../../..");
const pkg = join(server, "harness");
const outside = mkdtempSync(join(tmpdir(), "que-harness-pack-"));
// A copy of the plugin package beside it in server/, made before the tests, so its build finds what it needs, and
// plugin-pack.test.ts, which may run at the same time, builds and removes its own dist/ undisturbed.
let plugin = "";

// Inside que, npm sets the source condition for every process it starts (server/.npmrc): the folder gets neither.
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) => name !== "NODE_OPTIONS" && name !== "npm_config_node_options",
  ),
);

const run = (command: string, args: string[], cwd: string) =>
  execFileSync(command, args, { cwd, env, encoding: "utf8" });

let files: string[] = [];

before(() => {
  plugin = mkdtempSync(join(server, ".pack-plugin-"));
  for (const part of [
    "package.json",
    "tsconfig.build.json",
    "src",
    "standards",
    "types",
  ])
    cpSync(join(server, "plugin", part), join(plugin, part), {
      recursive: true,
    });
  const [packed] = JSON.parse(
    run("npm", ["pack", "--json", "--pack-destination", outside], pkg),
  ) as { filename: string; files: { path: string }[] }[];
  files = packed.files.map((file) => file.path).sort();
  const [peer] = JSON.parse(
    run("npm", ["pack", "--json", "--pack-destination", outside], plugin),
  ) as { filename: string }[];
  writeFileSync(
    join(outside, "package.json"),
    JSON.stringify({ name: "consumer", private: true, type: "module" }),
  );
  run(
    "npm",
    [
      "install",
      "--prefer-offline",
      "--no-audit",
      "--no-fund",
      join(outside, packed.filename),
      join(outside, peer.filename),
    ],
    outside,
  );
});

after(() => {
  rmSync(outside, { recursive: true, force: true });
  rmSync(plugin, { recursive: true, force: true });
  rmSync(join(pkg, "dist"), { recursive: true, force: true });
  rmSync(join(pkg, "LICENSE"), { force: true });
});

test("the tarball holds the build, the type notes, the manifest and the license, and nothing else", () => {
  const modules = readdirSync(join(pkg, "src"))
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => file.slice(0, -".ts".length));
  const notes = readdirSync(join(pkg, "types/harness")).map(
    (note) => `types/harness/${note}`,
  );
  assert.deepEqual(
    files,
    [
      "LICENSE",
      ...modules.flatMap((name) => [`dist/${name}.d.ts`, `dist/${name}.js`]),
      "package.json",
      ...notes,
    ].sort(),
  );
});

test("plain Node imports it by name in a folder that installed the tarball", () => {
  const loaded = JSON.parse(
    run(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const m = await import("@mku1tra/que-harness");
console.log(JSON.stringify({ exports: Object.keys(m), url: import.meta.resolve("@mku1tra/que-harness") }));`,
      ],
      outside,
    ),
  ) as { exports: string[]; url: string };
  assert.ok(
    loaded.url.endsWith("/node_modules/@mku1tra/que-harness/dist/index.js"),
    loaded.url,
  );
  for (const name of [
    "defineDeployment",
    "defineAgent",
    "readDeployment",
    "lintDeployment",
    "harness",
  ])
    assert.ok(loaded.exports.includes(name), `no export ${name}`);
});

test("its command runs from the folder's node_modules/.bin, and says how to use it", () => {
  const { status, stderr } = spawnSync(
    join(outside, "node_modules/.bin/que-harness"),
    [],
    { cwd: outside, env, encoding: "utf8" },
  );
  assert.equal(status, 2);
  assert.equal(stderr.trim(), "usage: que-harness lint <deployment folder>");
});
