/**
 * Mount, against real folders: the deployments and packages in fixtures/.
 * No network: mounting reads
 * definitions and skills and opens no connection.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { loadDeployment } from "../../../harness/src/mount/deployment.js";
import * as fromDeployment from "../../../harness/src/mount/deployment.js";
import type { FactSources } from "../../../harness/src/mount/model-facts/index.js";
import {
  mountPackages,
  type MountedPackage,
} from "../../../harness/src/mount/packages.js";

const fixtures = join(import.meta.dirname, "fixtures");
const deployment = (name: string) => join(fixtures, "deployments", name);
const names = (mounted: MountedPackage[]) =>
  mounted.map((p) => p.definition.name);

const mount = async (name: string) =>
  mountPackages((await loadDeployment(deployment(name))).packages);

test("a listed folder can be an absolute path", async () => {
  assert.deepEqual(names(await mount("absolute")), ["beta"]);
});

test("a mounted package has its skills", async () => {
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

test("stops, naming the folder and the fault, when a listed package breaks the package contract", async () => {
  await assert.rejects(mount("bad"), (error: Error) => {
    assert.match(error.message, /packages\/bad/);
    assert.match(error.message, /description/);
    return true;
  });
});

test("stops, naming the deployment folder, when the definition breaks the contract", async () => {
  await assert.rejects(loadDeployment(deployment("broken")), (error: Error) => {
    assert.match(error.message, /deployments\/broken/);
    assert.match(error.message, /packages/);
    return true;
  });
});

test("stops, naming the skill, when a listed package has a skill that breaks the contract", async () => {
  await assert.rejects(mount("untitled-skill"), (error: Error) => {
    assert.match(error.message, /^mount:/);
    assert.match(error.message, /untitled-skill\/nameless/);
    assert.ok(error.cause instanceof Error);
    return true;
  });
});

test("a skill folder the definition does not list is not mounted", async () => {
  const mounted = await mount("unlisted-skill");
  assert.deepEqual(names(mounted), ["unlisted-skill"]);
  assert.deepEqual(mounted[0].skills, []);
});

test("a package with a bad cases file still mounts", async () => {
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

test("stops, naming the agent and the package, when an agent names a package the deployment does not mount", async () => {
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

test("a deployment is mounted with its models, in the order it lists them, and with none when it lists none", async () => {
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
  assert.deepEqual(
    (await fromDeployment.mountDeployment(deployment("two"))).models,
    [],
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
  await assert.rejects(
    fromDeployment.mountDeployment(deployment("agent-model-none")),
    /This deployment lists no models/,
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
