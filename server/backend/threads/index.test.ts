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

/** The fields of a thread a user changes, as the store gives them. */
const own = (
  t:
    | {
        title: string | null;
        archived: boolean;
        agent: string | null;
        model: string | null;
      }
    | undefined,
) =>
  t && { title: t.title, archived: t.archived, agent: t.agent, model: t.model };

test("given a thread, when its owner changes its title, archive and picks, then the store gives it changed, and a store opened after it reads the same", async () => {
  const db = new PGlite();
  const store = storeOn(db);
  const first = await store.make("ana");
  const second = await store.make("ana");
  assert.deepEqual(own(await store.get("ana", first.id)), {
    title: null,
    archived: false,
    agent: null,
    model: null,
  });
  assert.deepEqual(
    own(
      await store.change("ana", first.id, {
        title: "Plums",
        agent: "lean",
        model: "big",
      }),
    ),
    { title: "Plums", archived: false, agent: "lean", model: "big" },
  );
  // A change sets only the fields it names: the title stays, the model goes back to the agent's.
  await store.change("ana", first.id, { archived: true, model: null });
  await store.change("ana", second.id, { title: "Pears" });
  const reopened = storeOn(db);
  assert.deepEqual(
    {
      first: own(await reopened.get("ana", first.id)),
      second: own(await reopened.get("ana", second.id)),
      listed: (await reopened.list("ana")).map(own),
    },
    {
      first: { title: "Plums", archived: true, agent: "lean", model: null },
      second: { title: "Pears", archived: false, agent: null, model: null },
      listed: [
        { title: "Plums", archived: true, agent: "lean", model: null },
        { title: "Pears", archived: false, agent: null, model: null },
      ],
    },
  );
});

test("given a thread made with the picks made before it, then it holds them from the start", async () => {
  const store = storeOn(new PGlite());
  const picked = await store.make("ana", { agent: "lean", model: "big" });
  const agentOnly = await store.make("ana", { agent: "chat" });
  const none = await store.make("ana");
  assert.deepEqual(
    [picked, agentOnly, none].map((t) => [t.agent, t.model]),
    [
      ["lean", "big"],
      ["chat", null],
      [null, null],
    ],
  );
  assert.deepEqual(
    [
      (await store.get("ana", picked.id))?.agent,
      (await store.get("ana", picked.id))?.model,
    ],
    ["lean", "big"],
  );
});

test("given another user's thread, when a user changes or deletes it, then nothing changes: the store gives none, and its owner still has it as it was", async () => {
  const store = storeOn(new PGlite());
  const anas = await store.make("ana");
  await store.change("ana", anas.id, { title: "Ana's" });
  assert.equal(
    await store.change("ben", anas.id, { title: "Ben's", archived: true }),
    undefined,
  );
  assert.equal(await store.remove("ben", anas.id), false);
  assert.deepEqual(own(await store.get("ana", anas.id)), {
    title: "Ana's",
    archived: false,
    agent: null,
    model: null,
  });
  assert.equal(
    await store.change("ana", "no-such-thread", { title: "x" }),
    undefined,
  );
});

test("given a thread, when its owner deletes it, then it is gone from the store and its list, and the owner's other threads stay", async () => {
  const db = new PGlite();
  const store = storeOn(db);
  const gone = await store.make("ana");
  const kept = await store.make("ana");
  assert.equal(await store.remove("ana", gone.id), true);
  assert.equal(await store.remove("ana", gone.id), false);
  const reopened = storeOn(db);
  assert.equal(await reopened.get("ana", gone.id), undefined);
  assert.deepEqual(
    (await reopened.list("ana")).map((t) => t.id),
    [kept.id],
  );
});

test("given a threads table made before F3, when the store opens on it, then its rows keep their ids and conversation, and take a title, an archive and picks", async () => {
  const db = new PGlite();
  await db.query(S1_SETUP);
  await db.query(
    "ALTER TABLE threads ADD COLUMN conversation text, ADD COLUMN stopped boolean NOT NULL DEFAULT false",
  );
  await db.query(
    "INSERT INTO threads (id, owner, conversation) VALUES ('b5-thread', 'ana', '7')",
  );
  const store = storeOn(db);
  assert.deepEqual(own(await store.get("ana", "b5-thread")), {
    title: null,
    archived: false,
    agent: null,
    model: null,
  });
  await store.change("ana", "b5-thread", {
    title: "Old",
    archived: true,
    agent: "lean",
    model: "big",
  });
  assert.deepEqual(own(await store.get("ana", "b5-thread")), {
    title: "Old",
    archived: true,
    agent: "lean",
    model: "big",
  });
  assert.equal(await store.conversationOf("b5-thread"), "7");
});
