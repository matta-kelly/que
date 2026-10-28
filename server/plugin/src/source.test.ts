import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintFolder } from "@mku1tra/basis";
import { plugin } from "./schema.ts";
import { plugins } from "./source.ts";

// A plugin's code imports the package and zod as que's own copies, by URL, so it runs as code outside que does.
const imports = `import { definePlugin, defineCases } from ${JSON.stringify(new URL("./index.ts", import.meta.url).href)};
import * as z from ${JSON.stringify(import.meta.resolve("zod"))};
`;

const definition = (name = "warehouse") => `${imports}
export default definePlugin({
  name: "${name}",
  type: "plugin",
  title: "Warehouse",
  description: "The record of what the business has entered.",
  roles: [{ name: "${name}-read", type: "access-role", description: "Reads the record." }],
  ops: [
    {
      name: "${name}-get-fabric",
      type: "op",
      title: "Get a fabric",
      description: "Get one fabric by its code.",
      role: "${name}-read",
      input: z.object({ code: z.string().describe("The fabric code") }),
      run: async () => ({}),
    },
  ],
  capabilities: [
    { name: "find-fabric", type: "capability", title: "Find a fabric", description: "List or look up fabrics." },
  ],
});
`;

const cases = (capability = "find-fabric") => `${imports}
export default defineCases([
  {
    name: "count-drafted",
    type: "case",
    description: "Counts the drafted fabrics.",
    capability: "${capability}",
    input: "How many fabrics are drafted?",
    start: "Some fabrics are drafted.",
    good: "The answer is one number.",
  },
]);
`;

/** A folder to lint: the files of a warehouse plugin, under plugins/warehouse, and the notes, by path from the root. */
async function vault(files: Record<string, string> = {}) {
  const root = await mkdtemp(join(tmpdir(), "que-source-"));
  const all: Record<string, string> = {
    // Its code is ES modules, as a deployment's is.
    "package.json": '{ "type": "module" }\n',
    "plugins/warehouse/io.github.matta-kelly.que/index.ts": definition(),
    "plugins/warehouse/io.github.matta-kelly.que/cases.ts": cases(),
    "plugins/warehouse/skills/warehouse-fabric-guide/SKILL.md":
      "---\nname: warehouse-fabric-guide\ndescription: How to read a fabric.\nmetadata:\n  title: Fabric guide\n---\nRead it.\n",
    ...files,
  };
  for (const [path, text] of Object.entries(all)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), text);
  }
  return root;
}

const given = (root: string) => plugins(join(root, "plugins"), root)();

const lintOf = async (root: string) =>
  (
    await lintFolder(plugin, root, {
      sources: [plugins(join(root, "plugins"), root)],
      skip: (path) => path.startsWith("plugins/"),
    })
  ).problems;

const at = "plugins/warehouse/io.github.matta-kelly.que";

test("gives each node a plugin's code and skills give, by its real name, as code gives it", async () => {
  const root = await vault();
  try {
    const { pieces, problems } = await given(root);
    assert.deepEqual(problems, []);
    assert.deepEqual(
      pieces.map((p) => [p.path, p.name, p.fields.type]),
      [
        [
          "plugins/warehouse/skills/warehouse-fabric-guide/SKILL.md",
          "warehouse-fabric-guide",
          "skill",
        ],
        [`${at}/index.ts`, "warehouse", "plugin"],
        [
          `${at}/index.ts#ops/warehouse-get-fabric`,
          "warehouse-get-fabric",
          "op",
        ],
        [
          `${at}/index.ts#roles/warehouse-read`,
          "warehouse-read",
          "access-role",
        ],
        [
          `${at}/index.ts#capabilities/find-fabric`,
          "find-fabric",
          "capability",
        ],
        [`${at}/cases.ts#count-drafted`, "count-drafted", "case"],
      ],
    );
    const op = pieces.find((p) => p.name === "warehouse-get-fabric")?.fields;
    assert.equal(typeof op?.run, "function");
    assert.equal(op?.role, "warehouse-read");
    assert.deepEqual(
      pieces.find((p) => p.name === "warehouse")?.fields.skills,
      ["warehouse-fabric-guide"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gives the same pieces whatever the folder's plugin.json holds, as no card is read", async () => {
  const root = await vault();
  const carded = await vault({ "plugins/warehouse/plugin.json": "{" });
  try {
    const names = async (folder: string) =>
      (await given(folder)).pieces.map((p) => [p.path, p.name]);
    assert.deepEqual(await names(carded), await names(root));
    assert.deepEqual((await given(carded)).problems, []);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(carded, { recursive: true, force: true });
  }
});

test("lints a plugin's nodes with no problem, and a capability's note merges with its piece from the code", async () => {
  const root = await vault({
    "find-fabric.md": "---\ntype: capability\n---\nWhy it matters.\n",
  });
  try {
    assert.deepEqual(await lintOf(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gives a note that copies a fact of the code a problem on both, naming the other", async () => {
  const root = await vault({
    "find-fabric.md":
      '---\ntype: capability\ntitle: "Find a fabric"\n---\nWhy it matters.\n',
  });
  try {
    assert.deepEqual(
      (await lintOf(root)).map((p) => [p.path, p.rule, p.field]),
      [
        ["find-fabric.md", "basis/merge", "/title"],
        [`${at}/index.ts#capabilities/find-fabric`, "basis/merge", "/title"],
      ],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gives a case that names a capability no plugin has a problem at its case", async () => {
  const root = await vault({ [`${at}/cases.ts`]: cases("find-lace") });
  try {
    assert.deepEqual(
      (await lintOf(root)).map((p) => [p.path, p.rule, p.field]),
      [[`${at}/cases.ts#count-drafted`, "basis/link", "/capability"]],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gives a definition that cannot be read a problem of its own, and goes on to the next plugin", async () => {
  const root = await vault({
    [`${at}/index.ts`]: `${imports}\nexport default definePlugin({ name: "warehouse", type: "plugin", title: "Warehouse" } as never);\n`,
    "plugins/zebra/io.github.matta-kelly.que/index.ts": definition("zebra"),
  });
  try {
    const { pieces, problems } = await given(root);
    assert.ok(pieces.some((p) => p.name === "zebra"));
    assert.ok(!pieces.some((p) => p.name === "warehouse"));
    assert.deepEqual(
      problems.map((p) => p.path),
      [`${at}/index.ts`],
    );
    assert.match(
      problems[0]?.message ?? "",
      /^The definition cannot be read: plugin warehouse is invalid:\n- description Invalid input/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gives a skill that cannot be read a problem, and its folder's name as unread, so a link to it gives no more", async () => {
  const root = await vault({
    "plugins/warehouse/skills/warehouse-fabric-guide/SKILL.md":
      "---\nname: wave\ndescription: Waves.\n---\nWave.\n",
  });
  try {
    const { problems, unread } = await given(root);
    assert.match(
      problems[0]?.message ?? "",
      /^The skill cannot be read: skill warehouse-fabric-guide is invalid:\n- name must be its folder's name, warehouse-fabric-guide/,
    );
    assert.deepEqual(
      unread.map((u) => u.name),
      ["warehouse-fabric-guide"],
    );
    assert.deepEqual(
      (await lintOf(root)).map((p) => [p.path, p.rule ?? "fatal"]),
      [["plugins/warehouse/skills/warehouse-fabric-guide/SKILL.md", "fatal"]],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
