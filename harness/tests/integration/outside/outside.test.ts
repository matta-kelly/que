/**
 * que, started from a folder of one's own: a deployment and a package that
 * sit outside harness/, no login, no database, credentials from the
 * environment. Its own file, since it sets the environment for the whole
 * process, and the code is loaded after that, the way a start would load it.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const outside = mkdtempSync(join(tmpdir(), "que-outside-"));
cpSync(join(import.meta.dirname, "fixtures"), outside, { recursive: true });
after(() => rmSync(outside, { recursive: true, force: true }));

process.env.QUE_DEPLOYMENT = join(outside, "deployment");
process.env.QUE_NOTES_TOKEN = "abc";
delete process.env.DATABASE_URL;
delete process.env.DEV_USER_EMAIL;
// The model is named when the agent is built, and never called here.
process.env.FIREWORKS_API_KEY ??= "not-a-real-key";

test("que mounts a package from a folder outside que", async () => {
  const { packages } = await import("../../../agent/src/mount/mounted.js");
  assert.deepEqual(
    packages.map((p) => p.definition.name),
    ["notes"],
  );
});

test("the one user is local, and nobody is asked who they are", async () => {
  const { currentUser } = await import("../../../agent/src/users.js");
  const user = await currentUser(new Headers());
  assert.equal(user?.id, "local");
});

test("the package is in reach of the local user", async () => {
  const { catalogFor } = await import("../../../agent/src/mount/catalog.js");
  const catalog = await catalogFor("local");
  assert.deepEqual(
    catalog.map(({ pkg }) => pkg.definition.name),
    ["notes"],
  );
});

test("an operation runs with a connection made from the environment", async () => {
  const { packages } = await import("../../../agent/src/mount/mounted.js");
  const { getConnection } =
    await import("../../../agent/src/mount/credentials.js");
  const { definition } = packages[0];
  const conn = await getConnection(definition, "local");
  assert.deepEqual(await definition.ops[0].run({ conn }, {}), {
    token: "abc",
  });
});

test("a credential cannot be saved or removed", async () => {
  const { packages } = await import("../../../agent/src/mount/mounted.js");
  const { removeCredential, setCredential } =
    await import("../../../agent/src/mount/credentials.js");
  const { definition } = packages[0];
  await assert.rejects(
    setCredential(definition, "local", { token: "xyz" }),
    /environment/,
  );
  await assert.rejects(removeCredential(definition, "local"), /environment/);
});

test("the package counts as connected", async () => {
  const { connectedPackages } =
    await import("../../../agent/src/mount/credentials.js");
  const connected = await connectedPackages("local");
  assert.deepEqual([...connected.keys()], ["notes"]);
});

test("que builds the agent with no database", async () => {
  const { buildAgent } = await import("../../../agent/src/agent.js");
  assert.ok(await buildAgent("local"));
});
