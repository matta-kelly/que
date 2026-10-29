import { test } from "node:test";
import assert from "node:assert/strict";
import { lintRoot } from "@mku1tra/basis";
import { folderWith, url } from "../../tests/roots.ts";

const config = `import { pluginSchema } from ${url.plugin};
export default {
  schema: pluginSchema({
    name: "notes-root",
    description: "The plugin notes, as a root of its own.",
    root: new URL("./", import.meta.url),
  }),
};
`;

test("a plugin that is its own root lints from it: what it uses is there and not read, and README.md and its SKILL.md are no notes", async () => {
  const { folder, remove } = await folderWith({
    "basis.config.ts": config,
    "README.md": "# notes\n\nA plugin.\n",
    "io.github.matta-kelly.que/index.ts": `import { definePlugin } from ${url.plugin};
export default definePlugin({ name: "notes", type: "plugin", title: "Notes", description: "How the team writes things down.", kind: "domain", usesOps: ["odoo-find"] });
`,
    "skills/notes-guide/SKILL.md":
      "---\nname: notes-guide\ndescription: How to write a note.\n---\nWrite it down.\n",
    "notes-guide.md": "---\ntype: skill\n---\nWhy a note is written so.\n",
  });
  try {
    assert.deepEqual((await lintRoot(folder)).problems, []);
  } finally {
    await remove();
  }
});
