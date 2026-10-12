import { test } from "node:test";
import assert from "node:assert/strict";
import { createLocalUsers } from "./local.js";

test("the local user has the id local, whatever identity is given", async () => {
  const user = await createLocalUsers().ensure({
    email: "ann@example.test",
    name: "Ann",
  });
  assert.equal(user.id, "local");
});

test("only the id local finds the local user", async () => {
  const users = createLocalUsers();
  assert.equal((await users.get("local"))?.id, "local");
  assert.equal(await users.get("someone-else"), undefined);
});

test("there is one user", async () => {
  assert.equal((await createLocalUsers().list()).length, 1);
});

test("the local user can be renamed", async () => {
  const users = createLocalUsers();
  await users.update("local", { name: "Matt" });
  assert.equal((await users.get("local"))?.name, "Matt");
});
