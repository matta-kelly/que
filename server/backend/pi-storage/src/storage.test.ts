import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  ROOT_CONVERSATION_ID,
  type ConversationId,
  type Storage,
} from "@earendil-works/pi-durable";
import {
  createStorageConformance,
  type StorageConformanceAssertions,
  type StorageConformanceCase,
} from "@earendil-works/pi-durable/testing";
import { storageOn } from "./storage.ts";

const context = BACKGROUND_CONTEXT;

// pi's assertions, on node:assert. deepEqual is strict: a key that holds undefined is not the same as no key.
const assertions: StorageConformanceAssertions = {
  ok: (value, message) => assert.ok(value, message),
  strictEqual: (actual, expected) => assert.strictEqual(actual, expected),
  deepEqual: (actual, expected) => assert.deepStrictEqual(actual, expected),
  partialDeepEqual: (actual, expected) =>
    assert.partialDeepStrictEqual(actual, expected),
  greaterThan: (actual, expected) =>
    assert.ok(actual > expected, `expected ${actual} > ${expected}`),
  rejects: (operation, messageIncludes) =>
    assert.rejects(operation, (error: unknown) => {
      assert.ok(error instanceof Error, `expected an Error, got ${error}`);
      assert.ok(
        error.message.includes(messageIncludes),
        `expected "${error.message}" to include "${messageIncludes}"`,
      );
      return true;
    }),
};

// Each case gets its own empty database.
const cases = createStorageConformance({
  assertions,
  withStorage: async (use) => {
    const db = new PGlite();
    try {
      await use(storageOn(db));
    } finally {
      await db.close();
    }
  },
});

// A case pi renames or drops fails here, by name, and not as a pass.
function conformance(name: string): StorageConformanceCase["run"] {
  const found = cases.find((c) => c.name === name);
  if (!found) throw new Error(`pi's storage conformance has no case "${name}"`);
  return found.run;
}

test(
  "rejects every operation after close",
  conformance("rejects every operation after close"),
);

test(
  "reserves ID 1 for the immutable root conversation",
  conformance("reserves ID 1 for the immutable root conversation"),
);

test(
  "filters and pages conversations by durable owner edges",
  conformance("filters and pages conversations by durable owner edges"),
);

test(
  "paginates conversations by opaque cursor in ascending ID order",
  conformance("paginates conversations by opaque cursor in ascending ID order"),
);

// A database closed when the test ends, also when it fails: an open PGlite keeps the test process running.
function closedAfter(t: TestContext, db: PGlite): PGlite {
  t.after(() => db.close());
  return db;
}

// The data of a database, in a new one: what a restart of the server opens.
async function reopened(t: TestContext, db: PGlite): Promise<PGlite> {
  return closedAfter(t, new PGlite({ loadDataDir: await db.dumpDataDir() }));
}

test("mintId gives an id above every id minted before, after the storage is closed and opened again on the same data", async (t) => {
  // given: a storage that minted three ids and stored only the second
  const db = closedAfter(t, new PGlite());
  const before = storageOn(db);
  await before.mintId();
  const stored = await before.mintId<ConversationId>();
  const lastMinted = await before.mintId();
  await before.commit(
    [
      { type: "conversation", value: { id: ROOT_CONVERSATION_ID } },
      { type: "conversation", value: { id: stored } },
    ],
    context,
  );
  await before.close(context);
  const again = await reopened(t, db);

  // when: it is opened again on the same data, and mints
  const minted = await storageOn(again).mintId();

  // then: the id is above the last one minted, which was never stored
  assert.ok(
    minted > lastMinted,
    `minted ${minted}, not above ${lastMinted}, which was minted before the close`,
  );
});

test("mintId gives an id above every id stored before, after the storage is closed and opened again on the same data", async (t) => {
  // given: a storage that stored a conversation with an id it never minted
  const db = closedAfter(t, new PGlite());
  const before = storageOn(db);
  await before.commit(
    [
      { type: "conversation", value: { id: ROOT_CONVERSATION_ID } },
      { type: "conversation", value: { id: 9 as ConversationId } },
    ],
    context,
  );
  await before.close(context);
  const again = await reopened(t, db);

  // when: it is opened again on the same data, and mints
  const minted = await storageOn(again).mintId();

  // then: the id is above the stored one
  assert.ok(
    minted > 9,
    `minted ${minted}, not above 9, which was stored before the close`,
  );
});

// The ids of every conversation the storage holds, in one scan.
async function storedIds(storage: Storage): Promise<number[]> {
  const page = await storage.scanConversations({}, 100, undefined, context);
  return page.items.map((record) => record.id);
}

// `read`, again each time the last one settles, until `commit` settles: every read that runs while the commit is open.
async function readsWhileOpen<T>(
  commit: Promise<unknown>,
  read: () => Promise<T>,
): Promise<PromiseSettledResult<T>[]> {
  let open = true;
  const settled = commit.then(
    () => (open = false),
    () => (open = false),
  );
  const reads: PromiseSettledResult<T>[] = [];
  // A bound, so a read that never reaches the database cannot keep the test running.
  while (open && reads.length < 10_000) {
    const [result] = await Promise.allSettled([read()]);
    reads.push(result);
  }
  await settled;
  return reads;
}

const conversation = (id: number) => ({
  type: "conversation" as const,
  value: { id: id as ConversationId },
});

test("a commit that fails part way leaves none of its writes", async (t) => {
  for (const [name, writes, rejected] of [
    ["its last write takes the id of a stored conversation", [7, 1], [7]],
    ["its last write takes the id of one of its own writes", [7, 8, 7], [7, 8]],
  ] as const) {
    await t.test(name, async (t) => {
      // given: a storage that holds the root conversation
      const storage = storageOn(closedAfter(t, new PGlite()));
      await storage.commit([conversation(ROOT_CONVERSATION_ID)], context);

      // when: a commit writes conversations, and its last write fails
      await assert.rejects(
        storage.commit(writes.map(conversation), context),
        /already belongs/,
      );

      // then: no conversation of that commit is stored
      assert.deepStrictEqual(
        await storedIds(storage),
        [ROOT_CONVERSATION_ID],
        `conversations ${rejected.join(", ")} of the failed commit are not stored`,
      );
    });
  }
});

test("a read that runs while a commit is open sees none of its writes until it commits", async (t) => {
  for (const [name, writes, seen] of [
    ["a commit that succeeds", [7, 8], [[1], [1, 7, 8]]],
    ["a commit that fails at its last write", [7, 8, 1], [[1]]],
  ] as const) {
    await t.test(name, async (t) => {
      // given: a storage that holds the root conversation
      const storage = storageOn(closedAfter(t, new PGlite()));
      await storage.commit([conversation(ROOT_CONVERSATION_ID)], context);

      // when: a commit writes conversations, and reads scan them until the commit settles
      const commit = storage.commit(writes.map(conversation), context);
      const reads = await readsWhileOpen(commit, () => storedIds(storage));
      await commit.catch(() => {});

      // then: each read saw the state before the commit, or the state it committed, never a write it had not committed
      const partial = reads
        .filter((read) => read.status === "fulfilled")
        .map((read) => read.value)
        .filter((ids) => !seen.some((state) => state.join() === ids.join()));
      assert.deepStrictEqual(
        partial,
        [],
        `reads while the commit of ${writes.join(", ")} was open saw a state that was never committed`,
      );
    });
  }
});

test("a read that fails while a commit is open leaves the commit whole", async (t) => {
  for (const [name, read] of [
    [
      "a scan with a cursor that is not one of the storage's",
      (storage: Storage) =>
        storage.scanConversations({}, 10, { after: "x" }, context),
    ],
    [
      "a scan with a cursor whose id is not an integer",
      (storage: Storage) =>
        storage.scanConversations({}, 10, { after: 1.5 }, context),
    ],
  ] as const) {
    await t.test(name, async (t) => {
      // given: a storage that holds the root conversation
      const storage = storageOn(closedAfter(t, new PGlite()));
      await storage.commit([conversation(ROOT_CONVERSATION_ID)], context);

      // when: a commit writes conversations 7 and 8, and a read that fails runs until the commit settles
      const commit = storage.commit(
        [conversation(7), conversation(8)],
        context,
      );
      await readsWhileOpen(commit, () => read(storage));
      const [committed] = await Promise.allSettled([commit]);

      // then: the commit succeeds, and both of its conversations are stored
      assert.strictEqual(
        committed.status,
        "fulfilled",
        `the commit rejected: ${committed.status === "rejected" ? committed.reason : ""}`,
      );
      assert.deepStrictEqual(await storedIds(storage), [
        ROOT_CONVERSATION_ID,
        7,
        8,
      ]);
    });
  }
});
