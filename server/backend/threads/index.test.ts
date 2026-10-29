import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { storeOn } from "./index.js";

test("a thread is made for its owner, and each one made is a new thread", async () => {
  const store = storeOn(new PGlite());
  const first = await store.make("ana");
  const second = await store.make("ana");
  assert.equal(first.owner, "ana");
  assert.equal(second.owner, "ana");
  assert.notEqual(first.id, second.id);
});

test("a thread is read only by its owner", async () => {
  const store = storeOn(new PGlite());
  const anas = await store.make("ana");
  const bens = await store.make("ben");
  assert.equal((await store.get("ana", anas.id))?.id, anas.id);
  assert.equal((await store.get("ben", bens.id))?.id, bens.id);
  assert.equal(await store.get("ben", anas.id), undefined);
  assert.equal(await store.get("ana", bens.id), undefined);
});

test("an owner's list holds their own threads and none of another's", async () => {
  const store = storeOn(new PGlite());
  const first = await store.make("ana");
  const second = await store.make("ana");
  const bens = await store.make("ben");
  const ids = async (owner: string) =>
    (await store.list(owner)).map((t) => t.id).sort();
  assert.deepEqual(await ids("ana"), [first.id, second.id].sort());
  assert.deepEqual(await ids("ben"), [bens.id]);
  assert.deepEqual(await ids("cy"), []);
});
