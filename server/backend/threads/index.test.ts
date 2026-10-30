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

// The threads table as S1 made it, before a thread had a conversation.
const S1_SETUP = `
  CREATE TABLE threads (
    id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    owner      text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

test("a threads table made before B5 gets its conversation column, and keeps its rows", async () => {
  const db = new PGlite();
  await db.query(S1_SETUP);
  await db.query("INSERT INTO threads (id, owner) VALUES ('s1-thread', 'ana')");
  const store = storeOn(db);
  const made = await store.make("ana");
  const { rows } = await db.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'threads' AND column_name = 'conversation'",
  );
  assert.deepEqual(rows, [{ column_name: "conversation", data_type: "text" }]);
  assert.equal((await store.get("ana", made.id))?.id, made.id);
  assert.equal((await store.get("ana", "s1-thread"))?.id, "s1-thread");
});

test("a thread's conversation is written to its row and read back", async () => {
  const store = storeOn(new PGlite());
  const first = await store.make("ana");
  const second = await store.make("ana");
  assert.equal(await store.conversationOf(first.id), null);
  await store.setConversation(first.id, "conversation-1");
  await store.setConversation(second.id, "conversation-2");
  assert.equal(await store.conversationOf(first.id), "conversation-1");
  assert.equal(await store.conversationOf(second.id), "conversation-2");
  await store.setConversation(first.id, "conversation-3");
  assert.equal(await store.conversationOf(first.id), "conversation-3");
});

test("a thread made before B5 has no conversation, and gets one", async () => {
  const db = new PGlite();
  await db.query(S1_SETUP);
  await db.query("INSERT INTO threads (id, owner) VALUES ('s1-thread', 'ana')");
  const store = storeOn(db);
  assert.equal(await store.conversationOf("s1-thread"), null);
  await store.setConversation("s1-thread", "conversation-1");
  assert.equal(await store.conversationOf("s1-thread"), "conversation-1");
  assert.equal(await store.conversationOf("no-such-thread"), null);
});

test("a conversation kept by a store is read by a store opened after it, as a restarted process opens one", async () => {
  const db = new PGlite();
  const store = storeOn(db);
  const thread = await store.make("ana");
  await store.setConversation(thread.id, "conversation-1");
  const reopened = storeOn(db);
  await reopened.make("ana");
  assert.equal(await reopened.conversationOf(thread.id), "conversation-1");
});
