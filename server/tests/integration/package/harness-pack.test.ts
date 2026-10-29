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
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
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
  // The type notes, and not the config that makes their folder a root: that is the repo's.
  const notes = readdirSync(join(pkg, "types/harness"))
    .filter((file) => file.endsWith(".md"))
    .map((note) => `types/harness/${note}`);
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

// npm corrects a manifest it would publish, and warns that it did: one npm pkg fix leaves as it is publishes as written.
test("its manifest is what npm pkg fix leaves, so a publish corrects nothing in it", () => {
  const copy = join(outside, "manifest");
  mkdirSync(copy);
  cpSync(join(pkg, "package.json"), join(copy, "package.json"));
  run("npm", ["pkg", "fix", "--loglevel=error"], copy);
  const read = (folder: string) =>
    JSON.parse(readFileSync(join(folder, "package.json"), "utf8")) as unknown;
  assert.deepEqual(read(copy), read(pkg));
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

// A deployment in the folder, and a plugin of its own repo, linked into its node_modules as npm workspaces link one:
// what a deployment that installs que-harness has.
const deploymentWith = (plugins: string[]) => {
  const files: Record<string, string> = {
    "plugins/notes/package.json": '{ "name": "notes", "type": "module" }\n',
    "plugins/notes/io.github.matta-kelly.que/index.ts": `import { definePlugin } from "@mku1tra/que-plugin";
export default definePlugin({ name: "notes", type: "plugin", title: "Notes", description: "How the team writes things down." });
`,
    "deployment/index.ts": `import { defineDeployment } from "@mku1tra/que-harness";
export default defineDeployment({ name: "outside", type: "deployment", description: "A deployment.", plugins: ["notes"], agents: ["chat"], loops: ["long-chat"], models: ["small"] });
`,
    "deployment/agents/chat.ts": `import { defineAgent } from "@mku1tra/que-harness";
export default defineAgent({ name: "chat", type: "agent", description: "The agent a chat gets.", plugins: ${JSON.stringify(plugins)}, model: "small", loop: "long-chat" });
`,
    "deployment/loops/long-chat.ts": `import { defineLoop } from "@mku1tra/que-harness";
export default defineLoop({ name: "long-chat", type: "loop", description: "A loop." });
`,
    "deployment/models/small.ts": `import { defineModel } from "@mku1tra/que-harness";
export default defineModel({ name: "small", type: "model", description: "A model.", id: "fireworks:small", maxTokens: 1000 });
`,
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(outside, path, ".."), { recursive: true });
    writeFileSync(join(outside, path), text);
  }
  rmSync(join(outside, "node_modules/notes"), { force: true });
  symlinkSync("../plugins/notes", join(outside, "node_modules/notes"));
};

const lint = () =>
  spawnSync(
    join(outside, "node_modules/.bin/que-harness"),
    ["lint", "deployment"],
    { cwd: outside, env, encoding: "utf8" },
  );

test("its command lints a deployment and a linked plugin, and finds no problem in a sound one", () => {
  deploymentWith(["notes"]);
  const { status, stdout, stderr } = lint();
  assert.equal(status, 0, stderr);
  assert.equal(stdout.trim(), "no problem");
});

test("its command prints a problem of a deployment at its file, and ends with a fault", () => {
  deploymentWith(["notes", "delta"]);
  const { status, stderr } = lint();
  assert.equal(status, 1);
  assert.equal(
    stderr.trim(),
    "deployment/agents/chat.ts: /plugins: names the plugin delta, which the deployment does not mount (basis/link)",
  );
});
