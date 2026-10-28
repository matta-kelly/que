import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintFolder } from "@mku1tra/basis";
import { harness } from "./schema.ts";
import { deployment } from "./source.ts";

// Code imports the packages as que's own copies, by URL, so it runs as code outside que does.
const harnessAt = JSON.stringify(new URL("./index.ts", import.meta.url).href);
const pluginAt = JSON.stringify(import.meta.resolve("@mku1tra/que-plugin"));

const files = (plugins: string[]): Record<string, string> => ({
  // Its code is ES modules, as a deployment's is.
  "package.json": '{ "type": "module" }\n',
  "index.ts": `import { defineDeployment } from ${harnessAt};
export default defineDeployment({ name: "landl", type: "deployment", description: "The landl deployment.", plugins: ${JSON.stringify(plugins)}, agents: ["chat"], loops: ["long-chat"], models: ["small"] });
`,
  "agents/chat.ts": `import { defineAgent } from ${harnessAt};
export default defineAgent({ name: "chat", type: "agent", description: "The agent a chat gets.", plugins: ["notes"], model: "small", loop: "long-chat" });
`,
  "loops/long-chat.ts": `import { defineLoop } from ${harnessAt};
export default defineLoop({ name: "long-chat", type: "loop", description: "A loop for long chats.", summarize: { at: 0.8 } });
`,
  "models/small.ts": `import { defineModel } from ${harnessAt};
export default defineModel({ name: "small", type: "model", description: "A small model.", id: "fireworks:small", maxTokens: 1000 });
`,
  "node_modules/notes/package.json": '{ "name": "notes", "type": "module" }\n',
  "node_modules/notes/io.github.matta-kelly.que/index.ts": `import { definePlugin } from ${pluginAt};
export default definePlugin({ name: "notes", type: "plugin", title: "Notes", description: "How the team writes things down." });
`,
});

/** A deployment's folder, with the files given over the landl deployment's. */
async function folderWith(changed: Record<string, string> = {}) {
  const root = await mkdtemp(join(tmpdir(), "que-deployment-"));
  for (const [path, text] of Object.entries({
    ...files(["notes"]),
    ...changed,
  })) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), text);
  }
  return root;
}

const lintOf = async (root: string) =>
  (
    await lintFolder(harness, root, {
      sources: [deployment(root, root)],
      skip: (path) => path.startsWith("node_modules/"),
    })
  ).problems;

test("gives the deployment, each config its folders give and each plugin it names, each at its file", async () => {
  const root = await folderWith();
  try {
    const { pieces, problems } = await deployment(root, root)();
    assert.deepEqual(problems, []);
    assert.deepEqual(
      pieces.map((p) => [p.path, p.name, p.fields.type]),
      [
        ["index.ts", "landl", "deployment"],
        ["agents/chat.ts", "chat", "agent"],
        ["loops/long-chat.ts", "long-chat", "loop"],
        ["models/small.ts", "small", "model"],
        [
          "node_modules/notes/io.github.matta-kelly.que/index.ts",
          "notes",
          "plugin",
        ],
      ],
    );
    assert.deepEqual(await lintOf(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gives a plugin that is not installed a problem at the definition, and its name as unread, so a link to it gives no more", async () => {
  const root = await folderWith({
    "index.ts": files(["notes", "odoo"])["index.ts"],
  });
  try {
    assert.deepEqual(
      (await lintOf(root)).map((p) => [p.path, p.rule ?? "fatal", p.message]),
      [
        [
          "index.ts",
          "fatal",
          "The plugin odoo is not installed: no node_modules from this folder up holds an npm package of that name.",
        ],
      ],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gives a config file whose default export is no node of its type a problem of its own, listing each fault", async () => {
  const root = await folderWith({
    "agents/stray.ts": 'export default { name: "stray" };\n',
  });
  try {
    const { problems } = await deployment(root, root)();
    assert.deepEqual(
      problems.map((p) => [p.path, p.message]),
      [
        [
          "agents/stray.ts",
          'The agent cannot be read: its default export is no node of the type agent:\n- type Invalid input: expected "agent"\n- description Invalid input: expected string, received undefined\n- model Invalid input: expected string, received undefined\n- loop Invalid input: expected string, received undefined',
        ],
      ],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
