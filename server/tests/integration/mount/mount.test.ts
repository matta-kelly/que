/**
 * Mount, against real folders: the deployments and packages in fixtures/.
 * No network: mounting reads
 * definitions and skills and opens no connection.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  loadDeployment,
  mountFromEnv,
} from "../../../harness/src/mount/deployment.js";
import * as fromDeployment from "../../../harness/src/mount/deployment.js";
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

test("mounts the deployment QUE_DEPLOYMENT names, by an absolute path", async () => {
  const mounted = await mountFromEnv({ QUE_DEPLOYMENT: deployment("two") });
  assert.deepEqual(names(mounted), ["gamma", "alpha"]);
});

test("stops when QUE_DEPLOYMENT is not an absolute path", async () => {
  await assert.rejects(
    mountFromEnv({ QUE_DEPLOYMENT: "deployments/two" }),
    /absolute path/,
  );
});

test("stops, naming QUE_DEPLOYMENT, when it is not set", async () => {
  await assert.rejects(mountFromEnv({}), /QUE_DEPLOYMENT/);
});

test("mounts the packages the deployment lists, in order, and no other", async () => {
  assert.deepEqual(names(await mount("two")), ["gamma", "alpha"]);
});

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

test("stops when a listed folder does not exist", async () => {
  await assert.rejects(mount("missing"), (error: Error) => {
    assert.match(error.message, /holds no package/);
    assert.match(error.message, /packages\/nope/);
    return true;
  });
});

test("stops when a listed folder has no index.ts", async () => {
  await assert.rejects(mount("hollow"), (error: Error) => {
    assert.match(error.message, /holds no package/);
    assert.match(error.message, /packages\/hollow/);
    return true;
  });
});

test("stops, naming the folder and the fault, when a listed package breaks the package contract", async () => {
  await assert.rejects(mount("bad"), (error: Error) => {
    assert.match(error.message, /packages\/bad/);
    assert.match(error.message, /description/);
    return true;
  });
});

test("stops when the deployment folder has no index.ts", async () => {
  await assert.rejects(
    loadDeployment(deployment("nowhere")),
    (error: Error) => {
      assert.match(error.message, /deployments\/nowhere/);
      assert.match(error.message, /no index\.ts/);
      return true;
    },
  );
});

test("stops, naming the deployment folder, when the definition breaks the contract", async () => {
  await assert.rejects(loadDeployment(deployment("broken")), (error: Error) => {
    assert.match(error.message, /deployments\/broken/);
    assert.match(error.message, /packages/);
    return true;
  });
});

test("a deployment is loaded with the name it declares, not the name of its folder", async () => {
  const loaded = await loadDeployment(
    deployment("in-a-folder-of-another-name"),
  );
  assert.equal(loaded.name, "declared");
});

test("the error for a package that breaks its contract has the contract's own error as its cause", async () => {
  await assert.rejects(mount("bad"), (error: Error) => {
    assert.ok(error.cause instanceof Error);
    assert.match(error.cause.message, /^package bad is invalid/);
    return true;
  });
});

test("the error for a deployment that breaks its contract has the contract's own error as its cause", async () => {
  await assert.rejects(loadDeployment(deployment("broken")), (error: Error) => {
    assert.ok(error.cause instanceof Error);
    assert.match(error.cause.message, /^deployment broken is invalid/);
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

test("stops, naming the skill, when a listed skill has no file", async () => {
  await assert.rejects(mount("fileless-skill"), (error: Error) => {
    assert.match(error.message, /^mount:/);
    assert.match(error.message, /fileless-skill\/ghost/);
    return true;
  });
});

test("a package with a bad cases file still mounts", async () => {
  assert.deepEqual(names(await mount("bad-cases")), ["bad-cases"]);
});

test("a deployment is mounted with its agents, in the order it lists them", async () => {
  const mounted = await fromDeployment.mountDeployment(
    deployment("agents-two"),
  );
  assert.deepEqual(names(mounted.packages), ["gamma", "alpha"]);
  assert.deepEqual(mounted.agents, [
    {
      name: "chat",
      packages: ["alpha"],
      instructions: "You help the sales team.",
    },
    { name: "lean", model: "provider:small-model" },
  ]);
});

test("a deployment that lists no agents is mounted with none", async () => {
  const mounted = await fromDeployment.mountDeployment(deployment("two"));
  assert.deepEqual(names(mounted.packages), ["gamma", "alpha"]);
  assert.deepEqual(mounted.agents, []);
});

test("stops, naming the file, when a listed agent file does not exist", async () => {
  await assert.rejects(
    fromDeployment.mountDeployment(deployment("agent-file-missing")),
    (error: Error) => {
      assert.match(error.message, /^mount:/);
      assert.match(error.message, /agents\/nope\.ts/);
      return true;
    },
  );
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
