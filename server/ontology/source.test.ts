import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintFolder } from "@mku1tra/basis";
import { plugin } from "@que/ontology";
import { NAMESPACE } from "@que/ontology/names";
import { plugins } from "@que/ontology/source";

/** The card of a warehouse plugin, as que writes it from the definition and its cases. */
const card = {
  $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  name: "warehouse",
  description: "The record of what the business has entered.",
  extensions: {
    [NAMESPACE]: {
      format: 2,
      title: "Warehouse",
      ops: [
        {
          name: "get-fabric",
          title: "Get a fabric",
          description: "Get one fabric by its code.",
          role: "read",
          input: { type: "object" },
        },
      ],
      roles: [{ name: "read", description: "Reads the record." }],
      uses: { ops: [], skills: [] },
      capabilities: [
        {
          name: "find-fabric",
          title: "Find a fabric",
          description: "List or look up fabrics.",
        },
      ],
      cases: [
        {
          name: "count-drafted",
          description: "Counts the drafted fabrics.",
          capability: "find-fabric",
          input: "How many fabrics are drafted?",
          start: "Some fabrics are drafted.",
          good: "The answer is one number.",
        },
      ],
    },
  },
};

/** A folder to lint: the warehouse plugin, with its card and one skill, and the notes it is given. */
async function vault(notes: Record<string, string> = {}, cardOf = card) {
  const root = await mkdtemp(join(tmpdir(), "que-source-"));
  const dir = join(root, "plugins", "warehouse");
  await mkdir(join(dir, "skills", "fabric-guide"), { recursive: true });
  await writeFile(join(dir, "plugin.json"), JSON.stringify(cardOf));
  await writeFile(
    join(dir, "skills", "fabric-guide", "SKILL.md"),
    "---\nname: fabric-guide\ndescription: How to read a fabric.\nmetadata:\n  title: Fabric guide\n---\nRead it.\n",
  );
  for (const [path, text] of Object.entries(notes))
    await writeFile(join(root, path), text);
  return root;
}

const lintOf = (root: string) =>
  lintFolder(plugin, root, {
    sources: [plugins(join(root, "plugins"), root)],
    skip: (path) => path.endsWith("SKILL.md"),
  });

test("gives each node of a plugin from its card and its skills, each by its name in the graph", async () => {
  const root = await vault();
  try {
    const { pieces, problems } = await plugins(join(root, "plugins"), root)();
    assert.deepEqual(problems, []);
    assert.deepEqual(
      pieces.map((p) => [p.path, p.name, p.fields.type]),
      [
        [
          "plugins/warehouse/skills/fabric-guide/SKILL.md",
          "warehouse-fabric-guide",
          "skill",
        ],
        ["plugins/warehouse/plugin.json", "warehouse", "plugin"],
        ["plugins/warehouse/plugin.json", "warehouse-get-fabric", "op"],
        ["plugins/warehouse/plugin.json", "warehouse-read", "access-role"],
        ["plugins/warehouse/plugin.json", "find-fabric", "capability"],
        ["plugins/warehouse/plugin.json", "count-drafted", "case"],
      ],
    );
    assert.deepEqual(
      pieces.find((p) => p.name === "warehouse-get-fabric")?.fields.role,
      "warehouse-read",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lints a plugin's nodes with no problem, and a capability's note merges with its piece from the card", async () => {
  const root = await vault({
    "find-fabric.md": "---\ntype: capability\n---\nWhy it matters.\n",
  });
  try {
    assert.deepEqual(await lintOf(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gives a note that copies a fact of the card a problem on both, naming the other", async () => {
  const root = await vault({
    "find-fabric.md":
      '---\ntype: capability\ntitle: "Find a fabric"\n---\nWhy it matters.\n',
  });
  try {
    assert.deepEqual(
      (await lintOf(root)).map((p) => [p.path, p.rule, p.field]),
      [
        ["find-fabric.md", "basis/merge", "/title"],
        ["plugins/warehouse/plugin.json", "basis/merge", "/title"],
      ],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gives a case that names a capability no plugin has a problem on its card", async () => {
  const part = card.extensions[NAMESPACE];
  const lost = {
    ...card,
    extensions: {
      [NAMESPACE]: {
        ...part,
        cases: [{ ...part.cases[0], capability: "find-lace" }],
      },
    },
  };
  const root = await vault({}, lost);
  try {
    assert.deepEqual(
      (await lintOf(root)).map((p) => [p.path, p.rule, p.field]),
      [["plugins/warehouse/plugin.json", "basis/link", "/capability"]],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gives a card it cannot read a problem of its own, gives its plugin as unread, and goes on to the next plugin", async () => {
  const root = await vault();
  try {
    await writeFile(join(root, "plugins", "warehouse", "plugin.json"), "{");
    const next = join(root, "plugins", "zebra");
    await mkdir(next, { recursive: true });
    await writeFile(
      join(next, "plugin.json"),
      JSON.stringify({ ...card, name: "zebra" }),
    );
    const { pieces, problems, unread } = await plugins(
      join(root, "plugins"),
      root,
    )();
    assert.deepEqual(unread, [
      { path: "plugins/warehouse/plugin.json", name: "warehouse" },
    ]);
    assert.ok(pieces.some((p) => p.name === "zebra"));
    assert.ok(pieces.every((p) => p.path.startsWith("plugins/zebra/")));
    assert.equal(problems.length, 1);
    assert.equal(problems[0]?.path, "plugins/warehouse/plugin.json");
    assert.match(problems[0]?.message ?? "", /^The card cannot be read/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gives a skill whose name is not its folder's a problem, as que does not read it", async () => {
  const root = await vault();
  try {
    await writeFile(
      join(root, "plugins", "warehouse", "skills", "fabric-guide", "SKILL.md"),
      "---\nname: wave\ndescription: Waves.\n---\nWave.\n",
    );
    const { problems, unread } = await plugins(join(root, "plugins"), root)();
    assert.match(
      problems[0]?.message ?? "",
      /its name is not its folder's, fabric-guide/,
    );
    assert.deepEqual(
      unread.map((u) => u.name),
      ["warehouse-fabric-guide"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
