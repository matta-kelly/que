import { test } from "node:test";
import assert from "node:assert/strict";
import { runOfThread } from "./run-of-thread.ts";

/** A storage as the browser's is, in memory. */
function storage() {
  const kept = new Map<string, string>();
  return {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
    kept,
  };
}

test("runOfThread keeps a run by thread, and reads none where there is no storage", () => {
  const store = storage();
  const runs = runOfThread(() => store);
  assert.equal(runs.get("thread-a"), undefined);
  runs.set("thread-a", "run-1");
  runs.set("thread-b", "run-2");
  assert.equal(runs.get("thread-a"), "run-1");
  assert.equal(runs.get("thread-b"), "run-2");
  runs.clear("thread-a");
  assert.equal(runs.get("thread-a"), undefined);
  assert.equal(runs.get("thread-b"), "run-2");
  // A key of its own, so it meets no other thing kept in the same storage.
  assert.deepEqual([...store.kept.keys()], ["que:run:thread-b"]);

  // A private window, or a browser with storage turned off: each call is quiet.
  const none = runOfThread(() => {
    throw new Error("storage is off");
  });
  none.set("thread-a", "run-1");
  assert.equal(none.get("thread-a"), undefined);
  none.clear("thread-a");
});

test("runOfThread clears a run only when it is still the one of the thread", () => {
  const runs = runOfThread(() => storage());
  const store = storage();
  const kept = runOfThread(() => store);
  kept.set("thread-a", "run-2");
  // The end of an old run does not take away the run that came after it.
  kept.clear("thread-a", "run-1");
  assert.equal(kept.get("thread-a"), "run-2");
  kept.clear("thread-a", "run-2");
  assert.equal(kept.get("thread-a"), undefined);
  assert.equal(runs.get("thread-a"), undefined);
});
