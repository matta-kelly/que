import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  ROOT_CONVERSATION_ID,
  type ConversationId,
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
