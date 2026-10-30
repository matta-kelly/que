/**
 * Mount, against real folders: the deployments and plugins in fixtures/. Each deployment is a root of its own, made
 * from the fixtures (deploymentRoot): its plugins are installed by name, as links in its node_modules, and each is read,
 * and named, at its real folder under its plugins/. No network: mounting reads definitions and skills and opens no
 * connection, and each model's facts are its file's, or the installed model catalog's.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { factsOf } from "@mku1tra/que-harness";
import { mountDeployment } from "../../../runtime/src/mount/deployment.js";
import {
  loadPlugin,
  mountPlugin,
  type MountedPlugin,
} from "../../../runtime/src/mount/plugins.js";
import { deploymentRoot } from "../../deployment-root.js";

const fixtures = join(import.meta.dirname, "fixtures");
const deployment = (name: string) => deploymentRoot(fixtures, name);
const names = (mounted: MountedPlugin[]) =>
  mounted.map((p) => p.definition.plugin.name);

const mount = async (name: string) =>
  (await mountDeployment(deployment(name))).plugins;

const work = mkdtempSync(join(tmpdir(), "que-mount-"));
after(() => rmSync(work, { recursive: true, force: true }));
writeFileSync(join(work, "package.json"), '{ "type": "module" }\n');

// The config of a plugin that is a root of its own, as each plugin mounted alone is.
const pluginConfig = (
  name: string,
) => `import { pluginSchema } from "@mku1tra/que-plugin";
export default {
  schema: pluginSchema({ name: "${name}", description: "A plugin of a test.", root: new URL("./", import.meta.url) }),
};
`;

/**
 * A deployment in a repo of a deployment and its plugins, as landl is: the repo is the root, and gives the deployment's
 * sources; each plugin of `plugins` is copied under the repo's plugins/ and linked into the repo's node_modules, and
 * the deployment, in a folder under the repo, names `names`, with the agent, loop and model of the deployment two, and
 * `files` over them. Gives the deployment's folder.
 */
const deploymentWith = (
  names: string[],
  plugins: Record<string, string> = { beta: join(fixtures, "plugins/beta") },
  files: Record<string, string> = {},
) => {
  const repo = mkdtempSync(join(work, "repo-"));
  const dir = join(repo, "deployment");
  for (const folder of ["agents", "loops", "models"])
    cpSync(join(deployment("two"), folder), join(dir, folder), {
      recursive: true,
    });
  mkdirSync(join(repo, "node_modules"));
  for (const [name, from] of Object.entries(plugins)) {
    cpSync(from, join(repo, "plugins", name), { recursive: true });
    symlinkSync(join("..", "plugins", name), join(repo, "node_modules", name));
  }
  writeFileSync(join(repo, "package.json"), '{ "type": "module" }\n');
  writeFileSync(
    join(repo, "basis.config.ts"),
    `import { defineSchema } from "@mku1tra/basis";
import { deploymentSources, harness } from "@mku1tra/que-harness";
const root = import.meta.dirname;
export default {
  schema: defineSchema({
    name: "repo",
    description: "A repo of a deployment and its plugins.",
    types: {},
    imports: [harness],
    notes: new URL("./", import.meta.url),
    skip: (path) => path.endsWith("/SKILL.md"),
    sources: deploymentSources(root + "/deployment", root),
  }),
};
`,
  );
  writeFileSync(
    join(dir, "index.ts"),
    `import { defineDeployment } from "@mku1tra/que-harness";
export default defineDeployment({
  name: "by-name",
  type: "deployment",
  description: "A deployment in a repo.",
  plugins: ${JSON.stringify(names)},
  agents: ["bare"],
  loops: ["long-chat"],
  models: ["small"],
});
`,
  );
  for (const [path, text] of Object.entries(files))
    writeFileSync(join(dir, path), text);
  return dir;
};

// A plugin whose package.json names the @mku1tra/que-plugin it works with, as a peer, or another package.
const needing = (range: string, peer = "@mku1tra/que-plugin") => {
  const dir = mkdtempSync(join(work, "needs-plugin-"));
  cpSync(join(fixtures, "plugins/beta"), dir, { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "beta",
      type: "module",
      peerDependencies: { [peer]: range },
    }),
  );
  return dir;
};

// que's own @mku1tra/que-plugin, from the one place its version is written.
const version = (
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, "../../../plugin/package.json"),
      "utf8",
    ),
  ) as { version: string }
).version;

test("stops, naming the folder, the range and que's own version, when a plugin needs another @mku1tra/que-plugin", async () => {
  const dir = needing("^9.0.0");
  await assert.rejects(mountPlugin(dir), (error: Error) => {
    assert.ok(error.message.includes(dir));
    assert.match(error.message, /@mku1tra\/que-plugin \^9\.0\.0/);
    assert.ok(error.message.includes(`que's is ${version}`));
    return true;
  });
});

test("a plugin whose @mku1tra/que-plugin range que's own version satisfies is mounted", async () => {
  assert.deepEqual(names([await mountPlugin(needing(`^${version}`))]), [
    "beta",
  ]);
});

test("stops, saying the contract moved, when a plugin names @que/core as its peer", async () => {
  const dir = needing("^0.3.0", "@que/core");
  await assert.rejects(mountPlugin(dir), {
    message: `mount: ${dir}: the plugin contract moved to @mku1tra/que-plugin: name it as the peer in ${join(dir, "package.json")} ("@mku1tra/que-plugin": "^${version}"), in place of @que/core`,
  });
});

test("stops, naming the file, when a plugin's package.json is not JSON", async () => {
  const dir = needing("*");
  writeFileSync(join(dir, "package.json"), '{ "type": "module", }');
  await assert.rejects(mountPlugin(dir), (error: Error) => {
    assert.match(error.message, /^mount:/);
    assert.ok(error.message.includes(join(dir, "package.json")));
    return true;
  });
});

test("a plugin is found by its name, as Node finds an import of its npm package from the deployment's folder", async () => {
  const { plugins } = await mountDeployment(deploymentWith(["beta"]));
  assert.deepEqual(names(plugins), ["beta"]);
});

test("stops, naming the plugin and the deployment's index.ts, when a plugin it names is not installed", async () => {
  const dir = deploymentWith(["nowhere"]);
  await assert.rejects(mountDeployment(dir), (error: Error) => {
    assert.ok(
      error.message.includes(
        `${join(dir, "index.ts")}: The plugin nowhere is not installed`,
      ),
    );
    return true;
  });
});

test("a mounted plugin has its skills", async () => {
  const mounted = await mount("two");
  assert.deepEqual(mounted[1].skills, [
    {
      name: "alpha-greet",
      type: "skill",
      title: "Greet",
      description: "How to greet a customer.",
      body: "Say hello.",
    },
  ]);
});

test("stops, naming the folder and the fault, when a listed plugin breaks the plugin contract", async () => {
  await assert.rejects(mount("bad"), (error: Error) => {
    assert.match(error.message, /plugins\/bad\//);
    assert.match(error.message, /description/);
    return true;
  });
});

test("stops, naming the deployment's index.ts, when its definition breaks the contract", async () => {
  await assert.rejects(mount("broken"), (error: Error) => {
    assert.match(
      error.message,
      /deployments\/broken\/index\.ts: The deployment cannot be read: deployment broken is invalid:\n- plugins /,
    );
    return true;
  });
});

test("stops, naming the skill, when a listed plugin has a skill that breaks the contract", async () => {
  await assert.rejects(mount("misnamed-skill"), (error: Error) => {
    assert.match(error.message, /^mount:/);
    assert.match(error.message, /skill nameless is invalid/);
    return true;
  });
});

test("stops, naming the folder, when a folder under skills/ has no SKILL.md", async () => {
  await assert.rejects(
    mount("fileless-skill"),
    /^Error: mount: .*fileless-skill cannot be read:\n- .*skills\/ghost\/SKILL\.md: The skill cannot be read: skills\/ghost has no SKILL\.md\./,
  );
});

test("a domain mounts when each name it uses is a mounted connector's op or skill", async () => {
  assert.deepEqual(names(await mount("uses-resolve")), ["source", "domain"]);
});

test("stops, naming the domain's skill and the name, when a domain's skill uses an op the deployment does not give, which its own check passes", async () => {
  await assert.doesNotReject(loadPlugin(join(fixtures, "plugins/stray")));
  await assert.rejects(
    mount("uses-unresolved"),
    /^Error: mount: deployment .*uses-unresolved breaks the harness schema:\n- .*plugins\/stray\/skills\/stray-guide\/SKILL\.md: \/uses: It points at source-lose, which is not a node\. \(basis\/link\)$/,
  );
});

// A plugin in a folder of its own, a root of its own: a definition with `fields`, and a skill, `<name>-guide`.
const written = async (name: string, fields: string) => {
  const dir = join(work, name);
  mkdirSync(join(dir, "io.github.matta-kelly.que"), { recursive: true });
  writeFileSync(
    join(dir, "io.github.matta-kelly.que/index.ts"),
    `import { definePlugin } from "@mku1tra/que-plugin";
export default definePlugin({ name: "${name}", type: "plugin", title: "${name}", description: "A plugin.", ${fields} });
`,
  );
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name, type: "module" }),
  );
  mkdirSync(join(dir, `skills/${name}-guide`), { recursive: true });
  writeFileSync(
    join(dir, `skills/${name}-guide/SKILL.md`),
    `---\nname: ${name}-guide\ndescription: How to use it.\n---\nUse it.\n`,
  );
  writeFileSync(join(dir, "basis.config.ts"), pluginConfig(name));
  return dir;
};

test("stops, naming both definitions, when two plugins list one capability", async () => {
  const capability = `capabilities: [{ name: "find-fabric", type: "capability", title: "Find a fabric", description: "Look one up." }]`;
  const dir = deploymentWith(["one", "two"], {
    one: await written("one", capability),
    two: await written("two", capability),
  });
  // Each problem is at its file's full path; the other piece it names is by its path from the root, the repo.
  const one = join(dir, "..", "plugins", "one");
  await assert.rejects(mountDeployment(dir), (error: Error) => {
    assert.ok(
      error.message.includes(
        `${one}/io.github.matta-kelly.que/index.ts#capabilities/find-fabric: The name find-fabric is also the name of plugins/two/io.github.matta-kelly.que/index.ts#capabilities/find-fabric. (basis/unique-name)`,
      ),
      error.message,
    );
    return true;
  });
});

test("check-plugin stops a plugin that uses its own skill", async () => {
  const dir = await written(
    "selfish",
    `kind: "domain", usesSkills: ["selfish-guide"]`,
  );
  await assert.rejects(
    mountPlugin(dir),
    /\/usesSkills: selfish-guide is its own: a plugin uses only other plugins' ops and skills\. \(plugin\/own-use\)/,
  );
});

test("stops, saying where que's files go, when a plugin's definition is at its root", async () => {
  await assert.rejects(mount("old-layout"), (error: Error) => {
    assert.match(
      error.message,
      /plugins\/old-layout: que's files are in io\.github\.matta-kelly\.que\/, not at the plugin's root/,
    );
    return true;
  });
});

test("stops, naming the folder, when a listed folder holds no plugin", async () => {
  await assert.rejects(mount("hollow"), (error: Error) => {
    assert.match(
      error.message,
      /plugins\/hollow holds no plugin \(no io\.github\.matta-kelly\.que\/index\.ts\)/,
    );
    return true;
  });
});

test("mounts a plugin whatever its folder's plugin.json holds, as no card is read", async () => {
  const dir = mkdtempSync(join(work, "carded-"));
  cpSync(join(fixtures, "plugins/gamma"), dir, { recursive: true });
  writeFileSync(join(dir, "plugin.json"), "not a card\n");
  assert.deepEqual(names([await mountPlugin(dir)]), ["gamma"]);
});

test("stops, naming the case and its capability, when a plugin's case names a capability no plugin has", async () => {
  await assert.rejects(
    mount("bad-cases"),
    /^Error: mount: deployment .*bad-cases breaks the harness schema:\n- .*bad-cases\/io\.github\.matta-kelly\.que\/cases\.ts#refund-asked: \/capability: It points at refund, which is not a node\. \(basis\/link\)$/,
  );
});

test("stops, naming the file, when an agent breaks the contract, with the contract's own error", async () => {
  await assert.rejects(
    mountDeployment(deployment("agent-bad")),
    /agents\/modelless\.ts: The agent cannot be read: agent modelless is invalid:/,
  );
});

test("stops, naming the name, when two agents have one name", async () => {
  await assert.rejects(
    mountDeployment(deployment("agents-one-name")),
    (error: Error) => {
      assert.match(error.message, /^mount:/);
      assert.match(
        error.message,
        /agents\/chat-again\.ts: The name chat is also the name of .*agents\/chat\.ts\. \(basis\/unique-name\)/,
      );
      return true;
    },
  );
});

test("stops, naming the agent and the plugin, when an agent names a plugin the deployment does not mount", async () => {
  await assert.rejects(
    mountDeployment(deployment("agent-names-unmounted")),
    (error: Error) => {
      assert.match(
        error.message,
        /agents\/wants-delta\.ts: \/plugins: names the plugin delta, which the deployment does not mount \(basis\/link\)/,
      );
      return true;
    },
  );
});

test("stops, naming the agent and the loop, when an agent names a loop the deployment does not give", async () => {
  await assert.rejects(
    mountDeployment(deployment("agent-loop-unlisted")),
    (error: Error) => {
      assert.match(
        error.message,
        /agents\/looped\.ts: \/loop: names the loop long-chat, which no file in the deployment's loops\/ gives \(basis\/link\)/,
      );
      return true;
    },
  );
});

test("stops, naming the model and both agents, when two agents on one model have loops that summarize differently: pi sets compaction per model", async () => {
  for (const [name, other] of [
    ["model-loops-differ", "auditor"],
    ["model-loops-off", "archivist"],
  ])
    await assert.rejects(mountDeployment(deployment(name)), (error: Error) => {
      assert.match(error.message, /^mount:/);
      assert.match(error.message, /\bsmall\b/);
      assert.match(error.message, /\bteller\b/);
      assert.match(error.message, new RegExp(`\\b${other}\\b`));
      return true;
    });
});

test("mounts two agents on one model when they share its loop, or have loops that summarize alike", async () => {
  for (const [name, agents] of [
    ["agents-two", ["chat", "lean"]],
    ["model-loops-alike", ["teller", "keeper"]],
  ] as const) {
    const mounted = await mountDeployment(deployment(name));
    assert.deepEqual(
      mounted.agents.map((agent) => agent.name),
      agents,
    );
  }
});

const glm = "fireworks:accounts/fireworks/models/glm-5p3-flash";

test("a model the model catalog has no entry for mounts with the window and price its file gives, in the order the deployment names them", async () => {
  const mounted = await mountDeployment(deployment("models-two"));
  assert.deepEqual(mounted.models, [
    {
      name: "big",
      type: "model",
      description: "The big model of a fixture.",
      id: "fireworks:big-model",
      window: 1_000_000,
      maxTokens: 100_000,
      price: { input: 1, output: 2 },
    },
    {
      name: "small",
      type: "model",
      description: "The small model of a fixture.",
      id: "fireworks:small-model",
      window: 64_000,
      maxTokens: 8_000,
      price: { input: 1, output: 2 },
    },
  ]);
  assert.equal(factsOf("fireworks:big-model"), undefined);
  assert.equal(factsOf("fireworks:small-model"), undefined);
});

test("stops, naming the file and the field, when a model the model catalog has no entry for gives no window: a run sizes by it", async () => {
  await assert.rejects(
    mountDeployment(deployment("models-bare")),
    /models\/bare\.ts: \/window: Missing: .*\(basis\/fields\)/,
  );
});

test("the template deployment mounts as a copy of it is, its model with the model catalog's facts", async () => {
  const dir = join(work, "my-deployment");
  cpSync(join(import.meta.dirname, "../../../../templates/deployment"), dir, {
    recursive: true,
  });
  const mounted = await mountDeployment(dir);
  assert.deepEqual(
    mounted.models.map(({ name, id, window, price }) => ({
      name,
      id,
      window,
      price,
    })),
    [{ name: "glm-flash", id: glm, ...factsOf(glm) }],
  );
  assert.deepEqual(
    mounted.agents.map((agent) => agent.name),
    ["chat"],
  );
});

test("stops at startup, naming the deployment, when it names no model", async () => {
  await assert.rejects(
    mountDeployment(deployment("models-none")),
    /deployments\/models-none\/index\.ts: The deployment cannot be read: deployment models-none is invalid:\n- models /,
  );
});

test("stops, naming the model and the provider, when a model has a provider que does not have", async () => {
  await assert.rejects(
    mountDeployment(deployment("model-provider")),
    (error: Error) => {
      assert.match(error.message, /^mount:/);
      assert.match(error.message, /"elsewhere"/);
      assert.match(error.message, /"nowhere"/);
      assert.match(error.message, /Providers: fireworks$/);
      return true;
    },
  );
});

test("stops, naming the agent and the model, when an agent names a model the deployment does not give", async () => {
  await assert.rejects(
    mountDeployment(deployment("agent-model-unlisted")),
    (error: Error) => {
      assert.match(
        error.message,
        /agents\/lean\.ts: \/model: names the model small, which no file in the deployment's models\/ gives \(basis\/link\)/,
      );
      return true;
    },
  );
});

test("stops when MODEL is set, and says a model is a file of its own", async () => {
  await assert.rejects(
    mountDeployment(deployment("two"), {
      MODEL: "fireworks:some-model",
    }),
    (error: Error) => {
      assert.match(error.message, /^mount: MODEL is set/);
      assert.match(error.message, /models\//);
      return true;
    },
  );
  await mountDeployment(deployment("two"), {});
});

test("stops, naming the file, when a loop breaks the contract, with the contract's own error", async () => {
  await assert.rejects(
    mountDeployment(deployment("loop-bad")),
    /loops\/endless\.ts: The loop cannot be read: loop endless is invalid:/,
  );
});

test("stops, naming the file, on a model no file gives, one that breaks the contract, or one with the name of another", async () => {
  const stopsWith = (name: string, ...patterns: RegExp[]) =>
    assert.rejects(mountDeployment(deployment(name)), (error: Error) => {
      assert.match(error.message, /^mount:/);
      for (const pattern of patterns) assert.match(error.message, pattern);
      return true;
    });
  await stopsWith(
    "model-file-missing",
    /index\.ts: \/models: names the model nope, which no file in the deployment's models\/ gives \(basis\/link\)/,
  );
  await stopsWith(
    "models-one-name",
    /The name small is also the name of .*models\/small\.ts\. \(basis\/unique-name\)/,
  );
  await stopsWith(
    "model-bad",
    /models\/bad-price\.ts: The model cannot be read: model bad-price is invalid:/,
  );
});

// A model the deployment names, small, whose file writes `fields` after its name, type and description.
const smallWriting = (fields: string) =>
  deploymentWith(["beta"], undefined, {
    "models/small.ts": `import { defineModel } from "@mku1tra/que-harness";
export default defineModel({ name: "small", type: "model", description: "A small model.", ${fields} });
`,
  });

test("stops, naming the file, the field and the model catalog, when a model the model catalog has gives a window or a price in its file too: each fact has one place", async () => {
  for (const [field, value] of [
    ["window", "64_000"],
    ["price", "{ input: 1, output: 2 }"],
  ])
    await assert.rejects(
      mountDeployment(
        smallWriting(`id: "${glm}", maxTokens: 8_000, ${field}: ${value}`),
      ),
      new RegExp(
        `models/small\\.ts: /${field}: Also given by .*models/small\\.ts#catalog: .*\\(basis/merge\\)`,
      ),
    );
});

// A note of the model small, in the deployment's models/, beside its file: the note's own fields, and a line of prose.
const smallNote = (fields: string) =>
  `---\ntype: model\n${fields}\n---\nThe small model.\n`;

test("stops, naming the note and the model catalog, when a note of a model the model catalog has gives a window", async () => {
  await assert.rejects(
    mountDeployment(
      deploymentWith(["beta"], undefined, {
        "models/small.ts": `import { defineModel } from "@mku1tra/que-harness";
export default defineModel({ name: "small", type: "model", description: "A small model.", id: "${glm}", maxTokens: 8_000 });
`,
        "models/small.md": smallNote("window: 64000"),
      }),
    ),
    /models\/small\.md: \/window: Also given by .*models\/small\.ts#catalog: .*\(basis\/merge\)/,
  );
});

test("a model the model catalog has no entry for takes its window and price from its note", async () => {
  const mounted = await mountDeployment(
    deploymentWith(["beta"], undefined, {
      "models/small.ts": `import { defineModel } from "@mku1tra/que-harness";
export default defineModel({ name: "small", type: "model", description: "A small model.", id: "fireworks:small-model", maxTokens: 8_000 });
`,
      "models/small.md": smallNote(
        "window: 64000\nprice:\n  input: 1\n  output: 2",
      ),
    }),
  );
  const small = mounted.models.find((model) => model.name === "small");
  assert.equal(small?.window, 64_000);
  assert.deepEqual(small?.price, { input: 1, output: 2 });
});

test("stops, naming the file, when a model's maxTokens is above the window the model catalog gives", async () => {
  const window = factsOf(glm)!.window;
  await assert.rejects(
    mountDeployment(smallWriting(`id: "${glm}", maxTokens: ${window + 1}`)),
    new RegExp(
      `models/small\\.ts: /maxTokens: must not be above its window, got ${window + 1} and ${window} \\(harness/max-tokens-in-window\\)`,
    ),
  );
});

test("stops, naming the folder and saying how it gets one, when a deployment is in no root", async () => {
  const dir = mkdtempSync(join(work, "rootless-"));
  cpSync(join(fixtures, "deployments/models-bare"), dir, { recursive: true });
  await assert.rejects(mountDeployment(dir), (error: Error) => {
    assert.ok(error.message.startsWith(`mount: ${dir} is in no root:`));
    return true;
  });
});

test("stops, naming the root, when the root that holds a deployment gives no deployment of its name", async () => {
  const repo = mkdtempSync(join(work, "other-"));
  writeFileSync(
    join(repo, "basis.config.ts"),
    `import { defineSchema } from "@mku1tra/basis";
import { harness } from "@mku1tra/que-harness";
export default {
  schema: defineSchema({ name: "other", description: "A root that gives no deployment.", types: {}, imports: [harness], notes: new URL("./", import.meta.url) }),
};
`,
  );
  writeFileSync(join(repo, "package.json"), '{ "type": "module" }\n');
  const dir = join(repo, "models-bare");
  cpSync(join(fixtures, "deployments/models-bare"), dir, { recursive: true });
  await assert.rejects(mountDeployment(dir), (error: Error) => {
    assert.match(
      error.message,
      /^mount: the root .* gives no deployment models-bare/,
    );
    return true;
  });
});
