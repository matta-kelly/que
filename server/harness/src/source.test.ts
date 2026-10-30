import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintRoot } from "@mku1tra/basis";
import { folderWith, url, write } from "../../tests/roots.ts";
import { factsOf } from "./catalog.ts";
import { harness } from "./schema.ts";
import { deploymentSources } from "./source.ts";

// Code imports the packages as que's own copies, by URL, so it runs as code outside que does.
const files = (plugins: string[]): Record<string, string> => ({
  "index.ts": `import { defineDeployment } from ${url.harness};
export default defineDeployment({ name: "landl", type: "deployment", description: "The landl deployment.", plugins: ${JSON.stringify(plugins)}, agents: ["chat"], loops: ["long-chat"], models: ["small"] });
`,
  "agents/chat.ts": `import { defineAgent } from ${url.harness};
export default defineAgent({ name: "chat", type: "agent", description: "The agent a chat gets.", plugins: ["notes"], model: "small", loop: "long-chat" });
`,
  "loops/long-chat.ts": `import { defineLoop } from ${url.harness};
export default defineLoop({ name: "long-chat", type: "loop", description: "A loop for long chats.", summarize: { at: 0.8 } });
`,
  "models/small.ts": `import { defineModel } from ${url.harness};
export default defineModel({ name: "small", type: "model", description: "A small model.", id: "fireworks:small", window: 64_000, maxTokens: 1000 });
`,
  "node_modules/notes/package.json": '{ "name": "notes", "type": "module" }\n',
  "node_modules/notes/io.github.matta-kelly.que/index.ts": `import { definePlugin } from ${url.plugin};
export default definePlugin({ name: "notes", type: "plugin", title: "Notes", description: "How the team writes things down." });
`,
});

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

/** A deployment that is its own root, with the files given over the landl deployment's. */
const rootWith = (changed: Record<string, string> = {}) =>
  folderWith(
    { ...files(["notes"]), "basis.config.ts": ownRoot, ...changed },
    "que-deployment-",
  );

/** What the deployment's sources give, as one list of each. */
async function given(dir: string, root: string) {
  const all = {
    pieces: [] as {
      path: string;
      name: string;
      fields: Record<string, unknown>;
    }[],
    problems: [] as { path: string; message: string }[],
    unread: [] as { path: string; name: string }[],
  };
  for (const source of deploymentSources(dir, root)) {
    const one = await source();
    all.pieces.push(...one.pieces);
    all.problems.push(...one.problems);
    all.unread.push(...one.unread);
  }
  return all;
}

const problemsOf = async (root: string) =>
  (await lintRoot(root)).problems.map((p) => [
    p.path,
    p.rule ?? "fatal",
    p.message,
  ]);

test("gives the deployment, each config its folders give and each plugin it names, each at its file", async () => {
  const { folder, remove } = await rootWith();
  try {
    const { pieces, problems } = await given(folder, folder);
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
    assert.deepEqual(await problemsOf(folder), []);
  } finally {
    await remove();
  }
});

test("gives the model catalog's facts of each model it has an entry for, as another piece of its node at its file's #catalog, and none for one it has none for, whose file gives its own", async () => {
  const glm = "fireworks:accounts/fireworks/models/glm-5p3-flash";
  const { folder, remove } = await rootWith({
    "models/small.ts": `import { defineModel } from ${url.harness};
export default defineModel({ name: "small", type: "model", description: "A small model.", id: "${glm}", maxTokens: 1000 });
`,
    "models/beam.ts": `import { defineModel } from ${url.harness};
export default defineModel({ name: "beam", type: "model", description: "Beam.", id: "beam:Beam-1.0-501B-A23B", window: 1_048_576, maxTokens: 1000 });
`,
  });
  try {
    const { pieces, problems } = await given(folder, folder);
    assert.deepEqual(problems, []);
    assert.deepEqual(
      pieces.filter(
        // A piece with no id: the catalog's, not a model file's.
        (p) => p.fields.type === "model" && p.fields.id === undefined,
      ),
      [
        {
          path: "models/small.ts#catalog",
          name: "small",
          fields: {
            type: "model",
            window: factsOf(glm)!.window,
            price: factsOf(glm)!.price,
          },
        },
      ],
    );
    assert.ok(factsOf(glm), "the catalog has no entry");
    const { graph } = await lintRoot(folder);
    const node = (name: string) => graph.get(name, harness.types.model);
    assert.equal(node("small")?.window, factsOf(glm)!.window);
    assert.equal(node("beam")?.window, 1_048_576);
    assert.equal(node("beam")?.price, undefined);
    assert.deepEqual(await problemsOf(folder), []);
  } finally {
    await remove();
  }
});

test("a root above the deployment, as a repo of a deployment and its plugins is, lints it and a plugin linked from a node_modules above it, at its real path", async () => {
  // A workspace that holds the deployment and its plugin, linked from the workspace's own node_modules: none is in the
  // deployment's folder. The workspace's root gives the deployment's sources, as landl's does.
  const { folder: workspace, remove } = await folderWith({
    "basis.config.ts": `import { defineSchema } from ${url.basis};
import { deploymentSources, harness } from ${url.harness};
const root = import.meta.dirname;
export default {
  schema: defineSchema({
    name: "workspace",
    description: "A repo of a deployment and its plugins.",
    types: {},
    imports: [harness],
    notes: new URL("./", import.meta.url),
    sources: deploymentSources(root + "/landl", root),
  }),
};
`,
  });
  const plugin = "node_modules/notes";
  try {
    await write(
      workspace,
      Object.fromEntries(
        Object.entries(files(["notes"])).map(([path, text]) => [
          join("landl", path.replace(plugin, "plugins/notes")),
          text,
        ]),
      ),
    );
    await mkdir(join(workspace, "node_modules"));
    await symlink(
      join("..", "landl", "plugins", "notes"),
      join(workspace, plugin),
    );
    const { pieces, problems } = await given(
      join(workspace, "landl"),
      workspace,
    );
    assert.deepEqual(problems, []);
    assert.deepEqual(
      pieces.filter((p) => p.fields.type === "plugin").map((p) => p.path),
      ["landl/plugins/notes/io.github.matta-kelly.que/index.ts"],
    );
    assert.deepEqual(await problemsOf(workspace), []);
  } finally {
    await remove();
  }
});

test("gives a plugin whose real folder is outside the deployment's root a problem at the definition, and none of its pieces", async () => {
  // A plugin installed in a node_modules above the deployment, whose folder is not in the deployment's root.
  const workspace = await mkdtemp(join(tmpdir(), "que-workspace-"));
  const root = join(workspace, "landl");
  const plugin = "node_modules/notes";
  const all = {
    ...files(["notes"]),
    "package.json": '{ "type": "module" }\n',
    "basis.config.ts": ownRoot,
  };
  const part = (inPlugin: boolean) =>
    Object.fromEntries(
      Object.entries(all).filter(
        ([path]) => path.startsWith(plugin) === inPlugin,
      ),
    );
  try {
    await write(root, part(false));
    await write(workspace, part(true));
    assert.deepEqual(await problemsOf(root), [
      [
        "index.ts",
        "fatal",
        `The plugin notes is in ${await realpath(join(workspace, plugin))}, outside the root ${await realpath(root)}: a deployment's root holds the real folder of each plugin it names.`,
      ],
    ]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("gives a plugin that is not installed a problem at the definition, and its name as unread, so a link to it gives no more", async () => {
  const { folder, remove } = await rootWith({
    "index.ts": files(["notes", "odoo"])["index.ts"],
  });
  try {
    assert.deepEqual(await problemsOf(folder), [
      [
        "index.ts",
        "fatal",
        "The plugin odoo is not installed: no node_modules from this folder up holds an npm package of that name.",
      ],
    ]);
  } finally {
    await remove();
  }
});

test("gives a config file whose default export is no node of its type a problem of its own, listing each fault", async () => {
  const { folder, remove } = await rootWith({
    "agents/stray.ts": 'export default { name: "stray" };\n',
  });
  try {
    const { problems } = await given(folder, folder);
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
    await remove();
  }
});

// A deployment's package, as landl is one: its root's schema imports the harness schema, and its exports, in its
// exports.ts, are the definitions it gives. Its sources are the deployment's.
const packageRoot = `import { defineSchema } from ${url.basis};
import { deploymentSources, harness } from ${url.harness};
const root = import.meta.dirname;
export default {
  schema: defineSchema({
    name: "landl-package",
    description: "A package that exports its deployment's definitions.",
    types: {},
    imports: [harness],
    notes: new URL("./", import.meta.url),
    exports: () => import("./exports.ts"),
    sources: deploymentSources(root, root),
  }),
};
`;

const reexports = `export { default as landl } from "./index.ts";
export { default as chat } from "./agents/chat.ts";
export { default as longChat } from "./loops/long-chat.ts";
export { default as small } from "./models/small.ts";
export { default as notes } from "./node_modules/notes/io.github.matta-kelly.que/index.ts";
`;

test("a package that exports its deployment's definitions lints clean: the source gives a piece of each", async () => {
  const { folder, remove } = await rootWith({
    "basis.config.ts": packageRoot,
    "exports.ts": reexports,
  });
  try {
    assert.deepEqual(await problemsOf(folder), []);
  } finally {
    await remove();
  }
});

test("a definition a package exports that no source gives fails basis/definition-piece", async () => {
  const { folder, remove } = await rootWith({
    "basis.config.ts": packageRoot,
    // An agent outside agents/, which the source does not read.
    "spare/helper.ts": `import { defineAgent } from ${url.harness};
export default defineAgent({ name: "helper", type: "agent", description: "An agent no source reads.", model: "small", loop: "long-chat" });
`,
    "exports.ts": `${reexports}export { default as helper } from "./spare/helper.ts";\n`,
  });
  try {
    assert.deepEqual(await problemsOf(folder), [
      [
        ".",
        "basis/definition-piece",
        "The export helper of landl-package is the definition of the agent helper, and no source gives a piece of it: a source of the package gives a piece of each definition it exports.",
      ],
    ]);
  } finally {
    await remove();
  }
});
