import { test } from "node:test";
import assert from "node:assert/strict";
import { folderWith, url } from "../../tests/roots.ts";
import { readPlugin } from "./read.ts";

const text = (value: unknown) => JSON.stringify(value);

/** A plugin's files: its definition, with each op and the ops it lists, and each skill and its allowed-tools. */
function plugin(
  name: string,
  {
    kind,
    ops = {},
    skills = {},
  }: {
    kind?: "domain";
    /** Each op, by its name, and the ops it lists in its uses. None when left out. */
    ops?: Record<string, string[] | undefined>;
    /** Each skill, by its name, and what it lists in its allowed-tools. None when left out. */
    skills?: Record<string, string[] | undefined>;
  },
): Record<string, string> {
  const written = Object.entries(ops).map(
    ([op, uses]) =>
      `{ name: ${text(op)}, type: "op", title: "Op", description: "Does a thing.", ${uses ? `uses: ${text(uses)}, ` : ""}input: z.object({}), run: async () => ({}) }`,
  );
  return {
    "io.github.matta-kelly.que/index.ts": `import { definePlugin } from ${url.plugin};
import * as z from ${url.zod};
export default definePlugin({ name: ${text(name)}, type: "plugin", title: ${text(name)}, description: "A plugin.", ${kind ? `kind: ${text(kind)}, ` : ""}ops: [${written.join(", ")}] });
`,
    ...Object.fromEntries(
      Object.entries(skills).map(([skill, uses]) => [
        `skills/${skill}/SKILL.md`,
        `---\nname: ${skill}\ndescription: How to do it.\n${uses ? `allowed-tools: ${text(uses.join(" "))}\n` : ""}---\nDo it.\n`,
      ]),
    ),
  };
}

/** The usesOps readPlugin puts on the definition's plugin, of a plugin with the files given. */
async function madeUsesOps(files: Record<string, string>) {
  const { folder, remove } = await folderWith(files, "que-read-");
  try {
    const read = await readPlugin(folder);
    assert.deepEqual(read.problems, []);
    return read.definition?.plugin.usesOps ?? [];
  } finally {
    await remove();
  }
}

test("readPlugin makes the plugin's usesOps from its ops' and skills' uses, each name once and none of its own ops, and puts it on the definition's plugin", async () => {
  const cases: [string, Record<string, string>, string[]][] = [
    [
      "a domain whose ops and skills list ops, one name by both",
      plugin("pim", {
        kind: "domain",
        ops: {
          "pim-push": ["odoo-find", "warehouse-get-fabric"],
          "pim-check": ["odoo-find"],
          "pim-say": undefined,
        },
        skills: {
          "pim-guide": ["odoo-search", "odoo-find"],
          "pim-notes": undefined,
        },
      }),
      ["odoo-find", "odoo-search", "warehouse-get-fabric"],
    ],
    [
      "a domain whose one skill lists an op, and whose op lists none",
      plugin("sales", {
        kind: "domain",
        ops: { "sales-say": undefined },
        skills: { "sales-guide": ["pim-push"] },
      }),
      ["pim-push"],
    ],
    [
      "a domain whose one op lists ops, and that has no skill",
      plugin("stock", {
        kind: "domain",
        ops: { "stock-count": ["warehouse-count", "odoo-count"] },
      }),
      ["odoo-count", "warehouse-count"],
    ],
    [
      // A connector's skill lists its own ops: they are no other plugin's, so its plugin uses nothing.
      "a connector whose skill lists its own ops",
      plugin("odoo", {
        ops: { "odoo-find": undefined, "odoo-write": undefined },
        skills: { "odoo-guide": ["odoo-find", "odoo-write"] },
      }),
      [],
    ],
    [
      "a plugin whose ops and skills list nothing",
      plugin("notes", {
        ops: { "notes-find": undefined },
        skills: { "notes-guide": undefined },
      }),
      [],
    ],
  ];
  for (const [label, files, expected] of cases) {
    const made = await madeUsesOps(files);
    assert.deepEqual([...made].sort(), expected, label);
    assert.equal(new Set(made).size, made.length, `${label}: a name twice`);
  }
});
