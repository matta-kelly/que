/**
 * Mount, against real folders: the deployments and packages in fixtures/, and
 * the deployment in harness/deployments/. No network: mounting reads
 * definitions and skills and opens no connection.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  loadDeployment,
  mountFromEnv,
} from "../../../agent/src/mount/deployment.js";
import {
  mountPackages,
  type MountedPackage,
} from "../../../agent/src/mount/packages.js";

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

test("takes a QUE_DEPLOYMENT that is not absolute from harness/", async () => {
  const mounted = await mountFromEnv({ QUE_DEPLOYMENT: "deployments/landl" });
  assert.deepEqual(names(mounted), ["odoo"]);
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

test("a deployment that declares neither is loaded with a login and the store", async () => {
  const loaded = await loadDeployment(deployment("two"));
  assert.equal(loaded.user, "login");
  assert.equal(loaded.credentials, "store");
});

test("a deployment is loaded with the user and the credentials it declares", async () => {
  const loaded = await loadDeployment(deployment("local-setup"));
  assert.equal(loaded.user, "none");
  assert.equal(loaded.credentials, "env");
});
