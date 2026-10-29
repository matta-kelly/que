import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { lintRoot } from "@mku1tra/basis";
import { folderWith, url } from "../../tests/roots.ts";
import { deploymentGraph } from "./root.ts";
import { harness } from "./schema.ts";

// A deployment, landl, with one agent, loop and model, and its plugin notes under plugins/, each file by its path from
// the deployment's folder. Its code imports the packages as que's own copies, by URL, as code outside que does.
const deployment: Record<string, string> = {
  "index.ts": `import { defineDeployment } from ${url.harness};
export default defineDeployment({ name: "landl", type: "deployment", description: "The landl deployment.", plugins: ["notes"], agents: ["chat"], loops: ["long-chat"], models: ["small"] });
`,
  "agents/chat.ts": `import { defineAgent } from ${url.harness};
export default defineAgent({ name: "chat", type: "agent", description: "The agent a chat gets.", plugins: ["notes"], model: "small", loop: "long-chat" });
`,
  "loops/long-chat.ts": `import { defineLoop } from ${url.harness};
export default defineLoop({ name: "long-chat", type: "loop", description: "A loop for long chats." });
`,
  "models/small.ts": `import { defineModel } from ${url.harness};
export default defineModel({ name: "small", type: "model", description: "A small model.", id: "fireworks:accounts/fireworks/models/glm-5p3-flash", maxTokens: 1000 });
`,
  "plugins/notes/package.json": '{ "name": "notes", "type": "module" }\n',
  "plugins/notes/io.github.matta-kelly.que/index.ts": `import { definePlugin } from ${url.plugin};
export default definePlugin({ name: "notes", type: "plugin", title: "Notes", description: "How the team writes things down." });
`,
  "plugins/notes/skills/notes-guide/SKILL.md":
    "---\nname: notes-guide\ndescription: How to write a note.\n---\nWrite it down.\n",
};

// The config of a deployment that is its own root.
const ownRoot = `import { deploymentSchema } from ${url.harness};
export default {
  schema: deploymentSchema({
    name: "landl-root",
    description: "The landl deployment, as a root of its own.",
    root: new URL("./", import.meta.url),
  }),
};
`;

/** Install the plugin notes in the deployment at `dir`, as npm links one: from its node_modules to its folder. */
async function install(dir: string, from = "../plugins/notes") {
  await mkdir(join(dir, "node_modules"), { recursive: true });
  await symlink(from, join(dir, "node_modules/notes"));
}

/** Each file of the deployment, under `folder`, with the files given over its own. */
const under = (folder: string, files: Record<string, string> = {}) =>
  Object.fromEntries(
    Object.entries({ ...deployment, ...files }).map(([path, text]) => [
      `${folder}/${path}`,
      text,
    ]),
  );

test("a deployment in a vault, with a typed note of the vault beside it, lints green from its own root, and gives its graph", async () => {
  // The note is the vault's, of a type no schema of que gives: the deployment's root ends the vault's ground, and its
  // lint reads none of the vault's notes.
  const { folder: vault, remove } = await folderWith({
    "note.md":
      "---\ntype: doc\ndescription: A note of the vault.\n---\nProse.\n",
    ...under("deployment", { "basis.config.ts": ownRoot }),
  });
  try {
    const dir = join(vault, "deployment");
    await install(dir);
    assert.deepEqual((await lintRoot(dir)).problems, []);
    const { root, problems, graph } = await deploymentGraph(dir);
    assert.equal(root, dir);
    assert.deepEqual(problems, []);
    assert.deepEqual(graph.get("landl", harness.types.deployment)?.agents, [
      "chat",
    ]);
  } finally {
    await remove();
  }
});

test("a deployment's own root reads a note of one of its nodes, as another piece of that node, and leaves out README.md and each SKILL.md", async () => {
  const { folder, remove } = await folderWith(
    under(".", {
      "basis.config.ts": ownRoot,
      "README.md": "# landl\n\nHow to start it.\n",
      "chat.md": "---\ntype: agent\n---\nWhy a chat gets this agent.\n",
    }),
  );
  try {
    await install(folder);
    const { problems, graph } = await deploymentGraph(folder);
    assert.deepEqual(problems, []);
    assert.equal(
      graph.get("chat", harness.types.agent)?.description,
      "The agent a chat gets.",
    );
  } finally {
    await remove();
  }
});

test("a deployment in no root of its own is linted from the root whose ground holds it: the first folder up from it with a config", async () => {
  // A repo of a deployment and its plugins, as landl is: its root gives the deployment's sources.
  const { folder: repo, remove } = await folderWith({
    "basis.config.ts": `import { defineSchema } from ${url.basis};
import { deploymentSources, harness } from ${url.harness};
const root = import.meta.dirname;
export default {
  schema: defineSchema({
    name: "repo",
    description: "A repo of a deployment and its plugins.",
    types: {},
    imports: [harness],
    notes: new URL("./", import.meta.url),
    skip: (path) => path.endsWith("SKILL.md"),
    sources: deploymentSources(root + "/landl", root),
  }),
};
`,
    ...under("landl"),
  });
  try {
    await install(repo, "../landl/plugins/notes");
    const { root, problems, graph } = await deploymentGraph(
      join(repo, "landl"),
    );
    assert.equal(root, repo);
    assert.deepEqual(problems, []);
    assert.ok(graph.get("landl", harness.types.deployment));
  } finally {
    await remove();
  }
});

test("each problem of the deployment's root is at its file's full path", async () => {
  const { folder, remove } = await folderWith(
    under(".", {
      "basis.config.ts": ownRoot,
      "agents/chat.ts": deployment["agents/chat.ts"].replace(
        '"small"',
        '"big"',
      ),
    }),
  );
  try {
    await install(folder);
    const { problems } = await deploymentGraph(folder);
    assert.deepEqual(
      problems.map((p) => [p.path, p.rule, p.field]),
      [[join(folder, "agents/chat.ts"), "basis/link", "/model"]],
    );
  } finally {
    await remove();
  }
});

test("a deployment in no root fails, naming its folder and how it gets one", async () => {
  const { folder, remove } = await folderWith(deployment);
  try {
    await assert.rejects(deploymentGraph(folder), (error: Error) => {
      assert.ok(error.message.startsWith(`${folder} is in no root:`));
      assert.match(error.message, /deploymentSchema/);
      return true;
    });
  } finally {
    await remove();
  }
});
