/**
 * Mount, against real folders: the deployments and plugins in fixtures/.
 * No network: mounting reads
 * definitions and skills and opens no connection.
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
import { loadDeployment } from "../../../harness/src/mount/deployment.js";
import * as fromDeployment from "../../../harness/src/mount/deployment.js";
import type { FactSources } from "../../../harness/src/mount/model-facts/index.js";
import {
  mountPlugins,
  type MountedPlugin,
} from "../../../harness/src/mount/plugins.js";

const fixtures = join(import.meta.dirname, "fixtures");
const deployment = (name: string) => join(fixtures, "deployments", name);
const names = (mounted: MountedPlugin[]) =>
  mounted.map((p) => p.definition.name);

const mount = async (name: string) =>
  mountPlugins((await loadDeployment(deployment(name))).plugins);

test("a listed folder can be an absolute path", async () => {
  assert.deepEqual(names(await mount("absolute")), ["beta"]);
});

// A deployment in an npm workspace, as a repo of deployments is: a plugin of
// the repo is an npm package, linked into the root's node_modules, and the
// deployment sits in a folder under the root.
const workspace = mkdtempSync(join(tmpdir(), "que-mount-by-name-"));
after(() => rmSync(workspace, { recursive: true, force: true }));
writeFileSync(join(workspace, "package.json"), '{ "type": "module" }\n');
cpSync(join(fixtures, "plugins/beta"), join(workspace, "plugins/beta"), {
  recursive: true,
});
writeFileSync(
  join(workspace, "plugins/beta/package.json"),
  '{ "name": "beta", "type": "module" }\n',
);
mkdirSync(join(workspace, "node_modules"));
symlinkSync(
  join(workspace, "plugins/beta"),
  join(workspace, "node_modules/beta"),
);
const byName = (plugins: string[]) => {
  const dir = mkdtempSync(join(workspace, "deployment-"));
  const fixture = (path: string) => JSON.stringify(join(fixtures, path));
  writeFileSync(
    join(dir, "index.ts"),
    `import { defineDeployment } from "@que/core";
export default defineDeployment({
  name: "by-name",
  plugins: ${JSON.stringify(plugins)},
  agents: [${fixture("agents/bare.ts")}],
  loops: [${fixture("loops/long-chat.ts")}],
  models: [${fixture("models/small.ts")}],
});
`,
  );
  return dir;
};

// A plugin whose package.json names the @que/core it works with, as a peer.
const needingCore = (range: string) => {
  const dir = mkdtempSync(join(workspace, "needs-core-"));
  cpSync(join(fixtures, "plugins/beta"), dir, { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "beta",
      type: "module",
      peerDependencies: { "@que/core": range },
    }),
  );
  return dir;
};

// que's own @que/core, from the one place its version is written.
const core = (
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, "../../../core/package.json"),
      "utf8",
    ),
  ) as { version: string }
).version;

test("stops, naming the folder, the range and que's own version, when a plugin needs another @que/core", async () => {
  const dir = needingCore("^9.0.0");
  await assert.rejects(mountPlugins([dir]), (error: Error) => {
    assert.ok(error.message.includes(dir));
    assert.match(error.message, /@que\/core \^9\.0\.0/);
    assert.ok(error.message.includes(`que's is ${core}`));
    return true;
  });
});

test("a plugin whose @que/core range que's own version satisfies is mounted", async () => {
  assert.deepEqual(names(await mountPlugins([needingCore(`^${core}`)])), [
    "beta",
  ]);
});

test("stops, naming the file, when a plugin's package.json is not JSON", async () => {
  const dir = needingCore("*");
  writeFileSync(join(dir, "package.json"), '{ "type": "module", }');
  await assert.rejects(mountPlugins([dir]), (error: Error) => {
    assert.match(error.message, /^mount:/);
    assert.ok(error.message.includes(join(dir, "package.json")));
    return true;
  });
});

test("a listed plugin can be the name of its npm package, found as Node finds an import from the deployment's folder", async () => {
  const { plugins } = await loadDeployment(byName(["beta"]));
  assert.deepEqual(names(await mountPlugins(plugins)), ["beta"]);
});

test("stops, naming the plugin and the deployment folder, when a listed name is not installed", async () => {
  const dir = byName(["nowhere"]);
  await assert.rejects(loadDeployment(dir), (error: Error) => {
    assert.match(error.message, /"nowhere"/);
    assert.ok(error.message.includes(dir));
    return true;
  });
});

test("a mounted plugin has its skills", async () => {
  const mounted = await mount("two");
  assert.deepEqual(mounted[1].skills, [
    {
      id: "alpha/greet",
      title: "Greet",
      description: "How to greet a customer.",
      body: "Say hello.",
    },
  ]);
});

test("stops, naming the folder and the fault, when a listed plugin breaks the plugin contract", async () => {
  await assert.rejects(mount("bad"), (error: Error) => {
    assert.match(error.message, /plugins\/bad/);
    assert.match(error.message, /description/);
    return true;
  });
});

test("stops, naming the deployment folder, when the definition breaks the contract", async () => {
  await assert.rejects(loadDeployment(deployment("broken")), (error: Error) => {
    assert.match(error.message, /deployments\/broken/);
    assert.match(error.message, /plugins must be an array/);
    return true;
  });
});

test("stops, naming the skill, when a listed plugin has a skill that breaks the contract", async () => {
  await assert.rejects(mount("misnamed-skill"), (error: Error) => {
    assert.match(error.message, /^mount:/);
    assert.match(error.message, /misnamed-skill\/nameless/);
    assert.ok(error.cause instanceof Error);
    return true;
  });
});

test("a folder under skills/ with no SKILL.md is not a skill", async () => {
  const mounted = await mount("fileless-skill");
  assert.deepEqual(names(mounted), ["fileless-skill"]);
  assert.deepEqual(mounted[0].skills, []);
});

test("a domain mounts when each name it uses is a mounted connector's op or skill", async () => {
  assert.deepEqual(names(await mount("uses-resolve")), ["source", "domain"]);
});

test("stops, naming the domain and the name, when a domain uses what the deployment does not give", async () => {
  await assert.rejects(
    mount("uses-unresolved"),
    /^Error: mount: a plugin uses what the deployment does not give:\n- stray uses source_lose, and source has no op lose$/,
  );
});

test("a plugin with a bad cases file still mounts", async () => {
  assert.deepEqual(names(await mount("bad-cases")), ["bad-cases"]);
});

test("stops, naming the file, when an agent breaks the contract, with the contract's own error as its cause", async () => {
  await assert.rejects(
    fromDeployment.mountDeployment(deployment("agent-bad")),
    (error: Error) => {
      assert.match(error.message, /^mount:/);
      assert.match(error.message, /agents\/modelless\.ts/);
      assert.ok(error.cause instanceof Error);
      assert.match(error.cause.message, /^agent modelless is invalid/);
      return true;
    },
  );
});

test("stops, naming the name, when two agents have one name", async () => {
  await assert.rejects(
    fromDeployment.mountDeployment(deployment("agents-one-name")),
    (error: Error) => {
      assert.match(error.message, /^mount:/);
      assert.match(error.message, /two agents are named "chat"/);
      return true;
    },
  );
});

test("stops, naming the agent and the plugin, when an agent names a plugin the deployment does not mount", async () => {
  await assert.rejects(
    fromDeployment.mountDeployment(deployment("agent-names-unmounted")),
    (error: Error) => {
      assert.match(error.message, /^mount:/);
      assert.match(error.message, /wants-delta/);
      assert.match(error.message, /delta/);
      return true;
    },
  );
});

test("stops, naming the agent and the loop, when an agent names a loop the deployment does not list", async () => {
  await assert.rejects(
    fromDeployment.mountDeployment(deployment("agent-loop-unlisted")),
    (error: Error) => {
      assert.match(error.message, /^mount:/);
      assert.match(error.message, /"looped"/);
      assert.match(error.message, /"long-chat"/);
      return true;
    },
  );
});

test("a deployment is mounted with its models, in the order it lists them", async () => {
  const mounted = await fromDeployment.mountDeployment(
    deployment("models-two"),
  );
  assert.deepEqual(mounted.models, [
    {
      name: "big",
      id: "fireworks:big-model",
      window: 1_000_000,
      maxTokens: 100_000,
      price: { input: 1, output: 2 },
    },
    {
      name: "small",
      id: "fireworks:small-model",
      window: 64_000,
      maxTokens: 8_000,
      price: { input: 1, output: 2 },
    },
  ]);
});

test("stops at startup, naming the deployment, when it lists no model", async () => {
  await assert.rejects(
    fromDeployment.mountDeployment(deployment("models-none")),
    (error: Error) => {
      assert.match(error.message, /^mount: .*deployments\/models-none/);
      assert.match(
        error.message,
        /deployment models-none is invalid:\n- models is missing: list at least one model config/,
      );
      return true;
    },
  );
});

test("stops, naming the model and the provider, when a model has a provider que does not have", async () => {
  await assert.rejects(
    fromDeployment.mountDeployment(deployment("model-provider")),
    (error: Error) => {
      assert.match(error.message, /^mount:/);
      assert.match(error.message, /"elsewhere"/);
      assert.match(error.message, /"nowhere"/);
      assert.match(error.message, /Providers: fireworks/);
      return true;
    },
  );
});

test("stops, naming the agent and the model, when an agent names a model the deployment does not list", async () => {
  await assert.rejects(
    fromDeployment.mountDeployment(deployment("agent-model-unlisted")),
    (error: Error) => {
      assert.match(error.message, /^mount:/);
      assert.match(error.message, /"lean"/);
      assert.match(error.message, /"small"/);
      assert.match(error.message, /Models: big/);
      return true;
    },
  );
});

test("stops when MODEL is set, and says to list a model file", async () => {
  await assert.rejects(
    fromDeployment.mountDeployment(deployment("two"), {
      MODEL: "fireworks:some-model",
    }),
    (error: Error) => {
      assert.match(error.message, /^mount: MODEL is set/);
      assert.match(error.message, /`models`/);
      return true;
    },
  );
  await fromDeployment.mountDeployment(deployment("two"), {});
});

test("stops, naming the file, when a loop breaks the contract, with the contract's own error as its cause", async () => {
  await assert.rejects(
    fromDeployment.mountDeployment(deployment("loop-bad")),
    (error: Error) => {
      assert.match(error.message, /^mount:/);
      assert.match(error.message, /loops\/endless\.ts/);
      assert.ok(error.cause instanceof Error);
      assert.match(error.cause.message, /^loop endless is invalid/);
      return true;
    },
  );
});

test("stops, naming the file, on a model file that is missing, breaks the contract, or has the name of another", async () => {
  const stopsWith = (name: string, ...patterns: RegExp[]) =>
    assert.rejects(
      fromDeployment.mountDeployment(deployment(name)),
      (error: Error) => {
        assert.match(error.message, /^mount:/);
        for (const pattern of patterns) assert.match(error.message, pattern);
        return true;
      },
    );
  await stopsWith("model-file-missing", /models\/nope\.ts holds no model/);
  await stopsWith("models-one-name", /two models are named "small"/);
  await assert.rejects(
    fromDeployment.mountDeployment(deployment("model-bad")),
    (error: Error) => {
      assert.match(error.message, /^mount: .*models\/bad-price\.ts/);
      assert.ok(error.cause instanceof Error);
      assert.match(error.cause.message, /^model bad-price is invalid/);
      return true;
    },
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

test("mount asks no source for a model whose file writes its window and price", async () => {
  const none = sources({});
  const mounted = await fromDeployment.mountDeployment(
    deployment("models-two"),
    {},
    none,
  );
  assert.equal(mounted.models.length, 2);
  assert.deepEqual(none.asked, []);
});

test("a deployment is mounted with its models whole, in the order it lists them", async () => {
  const given = sources({ window: 200_000, price: { input: 3, output: 4 } });
  const mounted = await fromDeployment.mountDeployment(
    deployment("models-bare"),
    {},
    given,
  );
  assert.deepEqual(mounted.models, [
    {
      name: "big",
      id: "fireworks:big-model",
      window: 1_000_000,
      maxTokens: 100_000,
      price: { input: 1, output: 2 },
    },
    {
      name: "bare",
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
    fromDeployment.mountDeployment(
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
    fromDeployment.mountDeployment(
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
  await assert.rejects(
    fromDeployment.mountDeployment(deployment("models-bare"), {}, half),
  );
  assert.equal(half.done_, 1);
  // A window from the source that maxTokens does not fit in stops mount too.
  await assert.rejects(
    fromDeployment.mountDeployment(
      deployment("models-bare"),
      {},
      sources({ window: 4_000, price: { input: 3, output: 4 } }),
    ),
    /^Error: mount: .*maxTokens of the model bare must not be above its window/,
  );
});
