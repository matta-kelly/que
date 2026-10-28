/**
 * Mount, against real folders: the deployments and plugins in fixtures/. A deployment's plugins are installed by name,
 * as links in fixtures/deployments/node_modules, and each is read, and named, at its real folder in fixtures/plugins.
 * No network: mounting reads definitions and skills and opens no connection, and each model's facts are in its file,
 * or come from the sources a test hands in.
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
import { mountDeployment } from "../../../runtime/src/mount/deployment.js";
import type { FactSources } from "../../../runtime/src/mount/model-facts/index.js";
import {
  loadPlugin,
  mountPlugin,
  type MountedPlugin,
} from "../../../runtime/src/mount/plugins.js";

const fixtures = join(import.meta.dirname, "fixtures");
const deployment = (name: string) => join(fixtures, "deployments", name);
const names = (mounted: MountedPlugin[]) =>
  mounted.map((p) => p.definition.plugin.name);

const mount = async (name: string) =>
  (await mountDeployment(deployment(name))).plugins;

// A deployment in an npm workspace, as a repo of deployments is: a plugin of the repo is an npm package, linked into
// the root's node_modules, and the deployment sits in a folder under the root.
const workspace = mkdtempSync(join(tmpdir(), "que-mount-by-name-"));
after(() => rmSync(workspace, { recursive: true, force: true }));
writeFileSync(join(workspace, "package.json"), '{ "type": "module" }\n');
mkdirSync(join(workspace, "node_modules"));
const install = (name: string, dir: string) =>
  symlinkSync(dir, join(workspace, "node_modules", name));
install("beta", join(fixtures, "plugins/beta"));

// A deployment in the workspace that names `plugins`, with the agent, loop and model of the deployment two.
const deploymentWith = (plugins: string[]) => {
  const dir = mkdtempSync(join(workspace, "deployment-"));
  for (const folder of ["agents", "loops", "models"])
    cpSync(join(deployment("two"), folder), join(dir, folder), {
      recursive: true,
    });
  writeFileSync(
    join(dir, "index.ts"),
    `import { defineDeployment } from "@mku1tra/que-harness";
export default defineDeployment({
  name: "by-name",
  type: "deployment",
  description: "A deployment in a workspace.",
  plugins: ${JSON.stringify(plugins)},
  agents: ["bare"],
  loops: ["long-chat"],
  models: ["small"],
});
`,
  );
  return dir;
};

// A plugin whose package.json names the @mku1tra/que-plugin it works with, as a peer, or another package.
const needing = (range: string, peer = "@mku1tra/que-plugin") => {
  const dir = mkdtempSync(join(workspace, "needs-plugin-"));
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

test("stops, naming the domain and the name, when a domain uses an op the deployment does not give, which its own check passes", async () => {
  await assert.doesNotReject(loadPlugin(join(fixtures, "plugins/stray")));
  await assert.rejects(
    mount("uses-unresolved"),
    /^Error: mount: deployment .*uses-unresolved breaks the harness schema:\n- .*plugins\/stray\/io\.github\.matta-kelly\.que\/index\.ts: \/usesOps: It points at source-lose, which is not a node\. \(basis\/link\)$/,
  );
});

// A plugin in a folder of its own: a definition with `fields`, and a skill, `<name>-guide`.
const written = async (name: string, fields: string) => {
  const dir = join(workspace, name);
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
  return dir;
};

test("stops, naming both definitions, when two plugins list one capability", async () => {
  const capability = `capabilities: [{ name: "find-fabric", type: "capability", title: "Find a fabric", description: "Look one up." }]`;
  const one = await written("one", capability);
  const two = await written("two", capability);
  install("one", one);
  install("two", two);
  await assert.rejects(
    mountDeployment(deploymentWith(["one", "two"])),
    (error: Error) => {
      assert.ok(
        error.message.includes(
          `${one}/io.github.matta-kelly.que/index.ts#capabilities/find-fabric: The name find-fabric is also the name of ${two}/io.github.matta-kelly.que/index.ts#capabilities/find-fabric. (basis/unique-name)`,
        ),
      );
      return true;
    },
  );
});

test("check-plugin stops a plugin that uses its own skill", async () => {
  const dir = await written("selfish", `usesSkills: ["selfish-guide"]`);
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
  const dir = mkdtempSync(join(workspace, "carded-"));
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

test("a deployment is mounted with its models, in the order it names them", async () => {
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
      assert.match(error.message, /Providers: fireworks/);
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

/** Sources a test hands to mount: what each gives, and what each was asked for. */
function sources(gives: {
  window?: number;
  price?: { input: number; output: number };
}) {
  const asked: string[] = [];
  const made: FactSources & { asked: string[]; done_: number } = {
    asked,
    done_: 0,
    window: async (model) => {
      asked.push(`window of ${model.name}`);
      return gives.window === undefined
        ? { reason: "the provider did not answer" }
        : { window: gives.window };
    },
    price: async (model) => {
      asked.push(`price of ${model.name}`);
      return gives.price === undefined
        ? { reason: "the database has no such model" }
        : { price: gives.price };
    },
    done: async () => {
      made.done_++;
    },
  };
  return made;
}

test("mount asks no source for a model in models/ the deployment does not name, and mounts", async () => {
  const dir = deploymentWith(["beta"]);
  // A model of Beam with no window or price, as one is with BEAM_API_KEY unset: not named, so not run.
  writeFileSync(
    join(dir, "models/beam.ts"),
    `import { defineModel } from "@mku1tra/que-harness";
export default defineModel({ name: "beam", type: "model", description: "Beam.", id: "beam:Beam-1.0", maxTokens: 1000 });
`,
  );
  const none = sources({});
  const mounted = await mountDeployment(dir, {}, none);
  assert.deepEqual(
    mounted.models.map((model) => model.name),
    ["small"],
  );
  assert.deepEqual(none.asked, []);
});

test("mount asks no source for a model whose file writes its window and price", async () => {
  const none = sources({});
  const mounted = await mountDeployment(deployment("models-two"), {}, none);
  assert.equal(mounted.models.length, 2);
  assert.deepEqual(none.asked, []);
});

test("a deployment is mounted with its models whole, in the order it lists them", async () => {
  const given = sources({ window: 200_000, price: { input: 3, output: 4 } });
  const mounted = await mountDeployment(deployment("models-bare"), {}, given);
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
      name: "bare",
      type: "model",
      description: "The bare model of a fixture.",
      id: "fireworks:accounts/fireworks/models/bare-model",
      window: 200_000,
      maxTokens: 8_000,
      price: { input: 3, output: 4 },
    },
  ]);
  // Only the model that writes no fact is asked for, and the sources are told when mount is done.
  assert.deepEqual(given.asked, ["window of bare", "price of bare"]);
  assert.equal(given.done_, 1);
});

test("stops, naming the model, the fact, the reason and the field, when a model has no window or no price", async () => {
  await assert.rejects(
    mountDeployment(
      deployment("models-bare"),
      {},
      sources({ price: { input: 3, output: 4 } }),
    ),
    (error: Error) => {
      assert.match(error.message, /^mount: the model "bare" has no window/);
      assert.match(error.message, /the provider did not answer/);
      assert.match(error.message, /Write `window` in the model file/);
      return true;
    },
  );
  await assert.rejects(
    mountDeployment(
      deployment("models-bare"),
      {},
      sources({ window: 200_000 }),
    ),
    (error: Error) => {
      assert.match(error.message, /^mount: the model "bare" has no price/);
      assert.match(error.message, /the database has no such model/);
      assert.match(error.message, /Write `price` in the model file/);
      return true;
    },
  );
  // What a source gave before mount stopped is still kept: the sources are told mount is done.
  const half = sources({ window: 200_000 });
  await assert.rejects(mountDeployment(deployment("models-bare"), {}, half));
  assert.equal(half.done_, 1);
  // A window from the source that maxTokens does not fit in stops mount too.
  await assert.rejects(
    mountDeployment(
      deployment("models-bare"),
      {},
      sources({ window: 4_000, price: { input: 3, output: 4 } }),
    ),
    /models\/bare\.ts: \/maxTokens: must not be above its window, got 8000 and 4000 \(harness\/max-tokens-in-window\)/,
  );
});
