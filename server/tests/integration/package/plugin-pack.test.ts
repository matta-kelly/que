/**
 * The contract of `@mku1tra/que-plugin` on npm: what its tarball holds, and
 * that a folder with no que in it installs the tarball and imports it by name.
 * The pack builds `plugin/dist/`, which this test removes again: no other step
 * builds it. The folder is in the system's temp folder, so nothing of que is
 * above it, and its Node runs with no condition and no tsx.
 */

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pkg = join(import.meta.dirname, "../../../plugin");
const tsc = join(import.meta.dirname, "../../../node_modules/.bin/tsc");
const outside = mkdtempSync(join(tmpdir(), "que-pack-"));

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
  const [packed] = JSON.parse(
    run("npm", ["pack", "--json", "--pack-destination", outside], pkg),
  ) as { filename: string; files: { path: string }[] }[];
  files = packed.files.map((file) => file.path).sort();
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
      "@types/node@22",
    ],
    outside,
  );
});

after(() => {
  rmSync(outside, { recursive: true, force: true });
  rmSync(join(pkg, "dist"), { recursive: true, force: true });
  rmSync(join(pkg, "LICENSE"), { force: true });
});

test("the tarball holds the build, the standard's schema, the type notes, the manifest and the license, and nothing else", () => {
  const modules = readdirSync(join(pkg, "src"))
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => file.slice(0, -".ts".length));
  // The type notes, and not the config that makes their folder a root: that is the repo's.
  const notes = readdirSync(join(pkg, "types"))
    .filter((file) => file.endsWith(".md"))
    .map((note) => `types/${note}`);
  assert.deepEqual(
    files,
    [
      "LICENSE",
      ...modules.flatMap((name) => [`dist/${name}.d.ts`, `dist/${name}.js`]),
      "package.json",
      "standards/agent-plugins-1.0.0/plugin.schema.json",
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
        `const m = await import("@mku1tra/que-plugin");
const { existsSync } = await import("node:fs");
console.log(JSON.stringify({
  exports: Object.keys(m),
  url: import.meta.resolve("@mku1tra/que-plugin"),
  typeNote: existsSync(new URL("plugin.md", m.plugin.typeNotes)),
}));`,
      ],
      outside,
    ),
  ) as { exports: string[]; url: string; typeNote: boolean };
  assert.ok(
    loaded.url.endsWith("/node_modules/@mku1tra/que-plugin/dist/index.js"),
    loaded.url,
  );
  for (const name of [
    "definePlugin",
    "OpFailed",
    "defineCases",
    "readPlugin",
    "plugin",
    "plugins",
    "pluginSchema",
  ])
    assert.ok(loaded.exports.includes(name), `no export ${name}`);
  assert.ok(loaded.typeNote, "plugin.typeNotes holds no plugin.md");
});

test("a plugin in that folder type checks on the types in dist/index.d.ts", () => {
  writeFileSync(
    join(outside, "index.ts"),
    `import * as z from "zod";
import { definePlugin, OpFailed } from "@mku1tra/que-plugin";

export default definePlugin({
  name: "notes",
  type: "plugin",
  title: "Notes",
  description: "A plugin outside que.",
  ops: [
    {
      name: "notes-find",
      type: "op",
      title: "Find",
      description: "Finds a note by its title.",
      input: z.object({ title: z.string().describe("The note's title") }),
      run: async () => {
        throw new OpFailed("the notes are not reachable");
      },
    },
  ],
});
`,
  );
  writeFileSync(
    join(outside, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        noEmit: true,
        strict: true,
        module: "nodenext",
        moduleResolution: "nodenext",
        target: "ES2022",
        types: ["node"],
      },
      files: ["index.ts"],
    }),
  );
  let listed = "";
  try {
    listed = run(tsc, ["-p", "tsconfig.json", "--listFiles"], outside);
  } catch (error) {
    // No output means tsc did not run: the error says why.
    assert.fail((error as { stdout?: string }).stdout || String(error));
  }
  assert.ok(
    listed.includes("/node_modules/@mku1tra/que-plugin/dist/index.d.ts"),
  );
});
