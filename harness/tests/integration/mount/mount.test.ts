/**
 * Mount, against real folders: the deployments and packages in fixtures/, and
 * the deployment in harness/deployments/. No network: mounting reads
 * definitions and skills and opens no connection.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { loadDeployment } from "../../../agent/src/mount/deployment.js";
import { mountPackages } from "../../../agent/src/mount/packages.js";

const fixtures = join(import.meta.dirname, "fixtures");

const mount = async (deployment: string) =>
  mountPackages(
    (await loadDeployment(join(fixtures, "deployments", deployment))).packages,
  );

test("mounts the packages the deployment lists, and no other", async () => {
  const mounted = await mount("only-alpha");
  assert.deepEqual(
    mounted.map((p) => p.definition.name),
    ["alpha"],
  );
});

test("a listed folder can be an absolute path", async () => {
  const mounted = await mount("absolute");
  assert.deepEqual(
    mounted.map((p) => p.definition.name),
    ["beta"],
  );
});

test("a mounted package has its skills", async () => {
  const [alpha] = await mount("only-alpha");
  assert.deepEqual(alpha.skills, [
    {
      id: "alpha/greet",
      title: "Greet",
      description: "How to greet a customer.",
      body: "Say hello.",
    },
  ]);
});

test("stops, naming the folder, when a listed folder holds no package", async () => {
  await assert.rejects(mount("missing"), /packages\/nope/);
});

test("stops, naming the package, when two listed packages have the same name", async () => {
  await assert.rejects(mount("twice"), /"alpha"/);
});

test("stops, naming the deployment folder, when the definition breaks the contract", async () => {
  await assert.rejects(mount("broken"), /deployments\/broken/);
});

test("the landl deployment mounts odoo and nothing else", async () => {
  const landl = join(import.meta.dirname, "../../../deployments/landl");
  const mounted = await mountPackages((await loadDeployment(landl)).packages);
  assert.deepEqual(
    mounted.map((p) => p.definition.name),
    ["odoo"],
  );
});
