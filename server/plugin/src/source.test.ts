import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintFolder } from "@mku1tra/basis";
import * as z from "zod";
import { cardOf, cardText, type Card } from "./card.ts";
import { definePlugin } from "./contract.ts";
import { plugin } from "./schema.ts";
import { plugins } from "./source.ts";

const countDrafted = {
  name: "count-drafted",
  description: "Counts the drafted fabrics.",
  capability: "find-fabric",
  input: "How many fabrics are drafted?",
  start: "Some fabrics are drafted.",
  good: "The answer is one number.",
};

/** The card of a warehouse plugin, as que writes it from the definition and its cases. */
const cardWith = (cases = [countDrafted]) =>
  cardOf({
    definition: definePlugin({
      name: "warehouse",
      title: "Warehouse",
      description: "The record of what the business has entered.",
      roles: [{ name: "read", description: "Reads the record." }],
      ops: [
        {
          name: "get-fabric",
          title: "Get a fabric",
          description: "Get one fabric by its code.",
          role: "read",
          schema: z.object({ code: z.string().describe("The fabric code") }),
          run: async () => ({}),
        },
      ],
      capabilities: [
        {
          name: "find-fabric",
          title: "Find a fabric",
          description: "List or look up fabrics.",
        },
      ],
    }),
    cases,
  });

/** A folder to lint: the warehouse plugin, with its card and one skill, and the notes it is given. */
async function vault(
  notes: Record<string, string> = {},
  card: Card = cardWith(),
) {
  const root = await mkdtemp(join(tmpdir(), "que-source-"));
  const dir = join(root, "plugins", "warehouse");
  await mkdir(join(dir, "skills", "fabric-guide"), { recursive: true });
  await writeFile(join(dir, "plugin.json"), cardText(card));
  await writeFile(
    join(dir, "skills", "fabric-guide", "SKILL.md"),
    "---\nname: fabric-guide\ndescription: How to read a fabric.\nmetadata:\n  title: Fabric guide\n---\nRead it.\n",
  );
  for (const [path, text] of Object.entries(notes))
    await writeFile(join(root, path), text);
  return root;
}

const lintOf = async (root: string) =>
  (
    await lintFolder(plugin, root, {
      sources: [plugins(join(root, "plugins"), root)],
      skip: (path) => path.endsWith("SKILL.md"),
    })
  ).problems;

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
        [
          "plugins/warehouse/plugin.json#ops/get-fabric",
          "warehouse-get-fabric",
          "op",
        ],
        [
          "plugins/warehouse/plugin.json#roles/read",
          "warehouse-read",
          "access-role",
        ],
        [
          "plugins/warehouse/plugin.json#capabilities/find-fabric",
          "find-fabric",
          "capability",
        ],
        [
          "plugins/warehouse/plugin.json#cases/count-drafted",
          "count-drafted",
          "case",
        ],
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
        [
          "plugins/warehouse/plugin.json#capabilities/find-fabric",
          "basis/merge",
          "/title",
        ],
      ],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gives a case that names a capability no plugin has a problem on its card", async () => {
  const root = await vault(
    {},
    cardWith([{ ...countDrafted, capability: "find-lace" }]),
  );
  try {
    assert.deepEqual(
      (await lintOf(root)).map((p) => [p.path, p.rule, p.field]),
      [
        [
          "plugins/warehouse/plugin.json#cases/count-drafted",
          "basis/link",
          "/capability",
        ],
      ],
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
      cardText({ ...cardWith(), name: "zebra" }),
    );
    const { pieces, problems, unread } = await plugins(
      join(root, "plugins"),
      root,
    )();
    assert.deepEqual(unread, [
      { path: "plugins/warehouse/plugin.json", name: "warehouse" },
      {
        path: "plugins/warehouse/plugin.json",
        name: "warehouse-fabric-guide",
      },
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

test("gives each name a card it cannot read holds as unread, so a link to one gives no more problems", async () => {
  // A card of another format: JSON that is not a card que reads.
  const old = cardWith();
  const root = await vault(
    {
      "count-laces.md":
        '---\ntype: case\ndescription: Counts the laces.\ncapability: "[[find-fabric]]"\ninput: How many laces?\nstart: Some laces.\ngood: One number.\n---\n',
    },
    {
      ...old,
      extensions: {
        "io.github.matta-kelly.que": {
          ...old.extensions["io.github.matta-kelly.que"],
          format: 1 as 2,
        },
      },
    },
  );
  try {
    const { unread } = await plugins(join(root, "plugins"), root)();
    assert.deepEqual(
      unread.map((u) => u.name),
      [
        "warehouse",
        "warehouse-get-fabric",
        "warehouse-read",
        "find-fabric",
        "count-drafted",
        "warehouse-fabric-guide",
      ],
    );
    assert.deepEqual(
      (await lintOf(root)).map((p) => [p.path, p.rule ?? "fatal"]),
      [["plugins/warehouse/plugin.json", "fatal"]],
    );
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
      /^The skill cannot be read: skill warehouse-fabric-guide is invalid:\n- name must be its folder's name, fabric-guide/,
    );
    assert.deepEqual(
      unread.map((u) => u.name),
      ["warehouse-fabric-guide"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
