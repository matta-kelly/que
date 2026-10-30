import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { JsonValue } from "@earendil-works/chord";
import {
  ROOT_CONVERSATION_ID,
  StorageRequestError,
  type ConversationId,
  type Cursor,
  type EntryId,
  type EntryRecord,
  type Storage,
  type StorageWrite,
  type SubmissionId,
  type TaskId,
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

test(
  "scans deep fork history newest-first through every ancestor cap",
  conformance(
    "scans deep fork history newest-first through every ancestor cap",
  ),
);

test(
  "detaches prototype-like JSON keys without changing object prototypes",
  conformance(
    "detaches prototype-like JSON keys without changing object prototypes",
  ),
);

test(
  "indexes entries committed out of ID order",
  conformance("indexes entries committed out of ID order"),
);

test(
  "continues an entry cursor below its last item after a newer commit",
  conformance(
    "continues an entry cursor below its last item after a newer commit",
  ),
);

test(
  "commits mixed table writes atomically and rolls all of them back on failure",
  conformance(
    "commits mixed table writes atomically and rolls all of them back on failure",
  ),
);

test(
  "detaches retained writes and every returned record",
  conformance("detaches retained writes and every returned record"),
);

test(
  "scans tables in either ID order and continues a cursor in its order",
  conformance(
    "scans tables in either ID order and continues a cursor in its order",
  ),
);

test(
  "indexes request IDs per conversation and replaces complete submission records",
  conformance(
    "indexes request IDs per conversation and replaces complete submission records",
  ),
);

test(
  "replaces complete task records and pages filtered task scans",
  conformance("replaces complete task records and pages filtered task scans"),
);

test(
  "stores and scans sleeping tasks by status",
  conformance("stores and scans sleeping tasks by status"),
);

test(
  "stores owners and scans waiting and completing tasks by status",
  conformance("stores owners and scans waiting and completing tasks by status"),
);

test(
  "stores passive write submissions without input-only lifecycle states",
  conformance(
    "stores passive write submissions without input-only lifecycle states",
  ),
);

test(
  "keeps one global record ID namespace and rejects exhausted ID minting",
  conformance(
    "keeps one global record ID namespace and rejects exhausted ID minting",
  ),
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

test("an entry whose text holds U+0000 or a lone surrogate commits, and reads give back the same text", async (t) => {
  for (const [name, text] of [
    ["U+0000", "before\u0000after"],
    ["a lone high surrogate", "before\ud800after"],
    ["a lone low surrogate", "before\udc00after"],
  ] as const) {
    await t.test(name, async (t) => {
      // given: a storage that holds the root conversation
      const storage = storageOn(closedAfter(t, new PGlite()));
      await storage.commit([conversation(ROOT_CONVERSATION_ID)], context);
      const id = await storage.mintId<EntryId>();
      // the text in a model message, in data as a value, and in data as a key
      const written: EntryRecord = {
        id,
        conversationId: ROOT_CONVERSATION_ID,
        kind: "message",
        model: [{ role: "user", content: text, timestamp: 1 }],
        data: { text, [text]: "key" },
      };

      // when: the entry is committed, and read by id and by a scan
      await storage.commit([{ type: "entry", value: written }], context);
      const byId = await storage.entry(id, context);
      const scanned = await storage.scanEntries(
        { conversationId: ROOT_CONVERSATION_ID },
        10,
        undefined,
        context,
      );

      // then: both reads give back the entry exactly as written
      assert.deepStrictEqual(byId?.entry, written, "entry gave other text");
      assert.deepStrictEqual(
        scanned.items,
        [written],
        "scanEntries gave other text",
      );
    });
  }
});

test("scanEntries with an order that is not one of pi's rejects with a StorageRequestError", async (t) => {
  for (const order of ["bogus", "Ascending"]) {
    await t.test(order, async (t) => {
      // given: a storage that holds the root conversation and one entry
      const storage = storageOn(closedAfter(t, new PGlite()));
      await storage.commit([conversation(ROOT_CONVERSATION_ID)], context);
      const id = await storage.mintId<EntryId>();
      await storage.commit(
        [
          {
            type: "entry",
            value: { id, conversationId: ROOT_CONVERSATION_ID, kind: "note" },
          },
        ],
        context,
      );

      // when: a scan with no cursor asks for that order
      const scan = storage.scanEntries(
        {
          conversationId: ROOT_CONVERSATION_ID,
          order: order as "ascending",
        },
        10,
        undefined,
        context,
      );

      // then: it rejects as pi's scanStart does
      await assert.rejects(scan, (error: unknown) => {
        assert.ok(
          error instanceof StorageRequestError,
          `expected a StorageRequestError, got ${error}`,
        );
        assert.match(error.message, /Invalid scan order/);
        return true;
      });
    });
  }
});

// pi's cursor contract: a cursor is malformed, or it is used with an order that is not the one it was made with.
function isStorageRequestError(error: unknown): true {
  assert.ok(
    error instanceof StorageRequestError,
    `expected a StorageRequestError, got ${error}`,
  );
  return true;
}

// One task record, in the state it names.
function task(
  id: number,
  status: "pending" | "running" = "pending",
): StorageWrite {
  return {
    type: "task",
    value: {
      id: id as TaskId<JsonValue>,
      conversationId: ROOT_CONVERSATION_ID,
      kind: "test.task",
      version: 1,
      input: {},
      state:
        status === "pending"
          ? { status: "pending", checkpoint: {} }
          : { status: "running", checkpoint: {} },
      background: false,
      abortRequested: false,
    },
  };
}

// One queued input submission, with a request id of its own.
function submission(id: number): StorageWrite {
  return {
    type: "submission",
    value: {
      id: id as SubmissionId,
      conversationId: ROOT_CONVERSATION_ID,
      requestId: `request-${id}`,
      type: "input",
      status: "queued",
    },
  };
}

test("a commit that writes an entry with the id of a committed task rejects with pi's error, one global record ID namespace", async (t) => {
  // given: a storage that holds the root conversation and task 100
  const storage = storageOn(closedAfter(t, new PGlite()));
  await storage.commit(
    [conversation(ROOT_CONVERSATION_ID), task(100)],
    context,
  );

  // when: a commit writes an entry with ID 100
  const commit = storage.commit(
    [
      {
        type: "entry",
        value: {
          id: 100 as EntryId,
          conversationId: ROOT_CONVERSATION_ID,
          kind: "note",
        },
      },
    ],
    context,
  );

  // then: it rejects as pi's MemoryStorage does: the namespace is one across both tables
  await assert.rejects(commit, (error: unknown) => {
    assert.ok(error instanceof Error, `expected an Error, got ${error}`);
    assert.strictEqual(
      error.constructor,
      Error,
      `expected pi's plain Error, got ${error.name}`,
    );
    assert.strictEqual(error.message, "ID 100 already belongs to task");
    return true;
  });
});

type Scanned = {
  readonly items: readonly { readonly id: number }[];
  readonly next?: Cursor;
};

type Scan = {
  readonly name: string;
  readonly ids: readonly number[];
  readonly seed: (storage: Storage) => Promise<unknown>;
  readonly scan: (
    storage: Storage,
    order: "ascending" | "descending" | undefined,
    limit: number,
    cursor: Cursor | undefined,
  ) => Promise<Scanned>;
};

// The three scans B3 gives a cursor, each over its own records.
const scans: readonly Scan[] = [
  {
    name: "scanConversations",
    ids: [ROOT_CONVERSATION_ID, 7, 8],
    seed: (storage) =>
      storage.commit(
        [conversation(ROOT_CONVERSATION_ID), conversation(7), conversation(8)],
        context,
      ),
    scan: (storage, order, limit, cursor) =>
      storage.scanConversations(
        order === undefined ? {} : { order },
        limit,
        cursor,
        context,
      ),
  },
  {
    name: "scanTasks",
    ids: [7, 8],
    seed: (storage) =>
      storage.commit(
        [conversation(ROOT_CONVERSATION_ID), task(7), task(8)],
        context,
      ),
    scan: (storage, order, limit, cursor) =>
      storage.scanTasks(
        order === undefined ? {} : { order },
        limit,
        cursor,
        context,
      ),
  },
  {
    name: "scanSubmissions",
    ids: [7, 8],
    seed: (storage) =>
      storage.commit(
        [conversation(ROOT_CONVERSATION_ID), submission(7), submission(8)],
        context,
      ),
    scan: (storage, order, limit, cursor) =>
      storage.scanSubmissions(
        order === undefined ? {} : { order },
        limit,
        cursor,
        context,
      ),
  },
];

test("a scan takes an order, and continues its cursor in that order", async (t) => {
  for (const { name, ids, seed, scan } of scans) {
    await t.test(name, async (t) => {
      // given: a storage that holds the records of one scan
      const storage = storageOn(closedAfter(t, new PGlite()));
      await seed(storage);

      // when: it scans in each order, then pages newest first
      const ascending = await scan(storage, "ascending", 10, undefined);
      const descending = await scan(storage, "descending", 10, undefined);
      const first = await scan(storage, "descending", 1, undefined);

      // then: each order holds, and the cursor continues the order it was made with
      assert.deepStrictEqual(
        ascending.items.map((record) => record.id),
        ids,
        "ascending is oldest first",
      );
      assert.deepStrictEqual(
        descending.items.map((record) => record.id),
        [...ids].reverse(),
        "descending is newest first",
      );
      assert.ok(first.next, "a page of one has a next cursor");
      const second = await scan(storage, undefined, 10, first.next);
      assert.deepStrictEqual(
        second.items.map((record) => record.id),
        [...ids].reverse().slice(1),
        "a cursor with no order in its query continues newest first",
      );
    });
  }
});

test("a malformed cursor is a StorageRequestError", async (t) => {
  for (const { name, seed, scan } of scans) {
    await t.test(name, async (t) => {
      // given: a storage that holds the records of one scan
      const storage = storageOn(closedAfter(t, new PGlite()));
      await seed(storage);

      // then: a cursor that is not pi's is a StorageRequestError
      const malformed: Cursor[] = [
        { after: "x" },
        { after: 1.5 },
        { after: 1, order: "bogus" },
      ];
      for (const cursor of malformed) {
        await assert.rejects(
          scan(storage, undefined, 10, cursor),
          isStorageRequestError,
          `cursor ${JSON.stringify(cursor)} is malformed`,
        );
      }
    });
  }
});

test("a cursor used with another order is a StorageRequestError", async (t) => {
  for (const { name, seed, scan } of scans) {
    await t.test(name, async (t) => {
      // given: a storage that holds the records of one scan, and a cursor from a descending page
      const storage = storageOn(closedAfter(t, new PGlite()));
      await seed(storage);
      const first = await scan(storage, "descending", 1, undefined);
      assert.ok(first.next, "a page of one has a next cursor");

      // then: the cursor is not an ascending one
      await assert.rejects(
        scan(storage, "ascending", 1, first.next),
        isStorageRequestError,
        "a descending cursor is not an ascending one",
      );
    });
  }
});
