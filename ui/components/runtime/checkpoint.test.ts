import { test } from "node:test";
import assert from "node:assert/strict";
import { checkpointFor } from "./checkpoint.ts";

const state = (id: string, ...messages: string[]) => ({
  checkpoint: { checkpoint_id: id },
  values: { messages: messages.map((id) => ({ id })) },
});

// Newest first, as the server gives a thread's history.
const history = [
  state("c4", "human-1", "ai-1", "human-2", "ai-2"),
  state("c3", "human-1", "ai-1", "human-2"),
  state("c2", "human-1", "ai-1"),
  state("c1", "human-1"),
  state("c0"),
];

test("the checkpoint is the one of the state that holds the given messages and no other", () => {
  assert.equal(
    checkpointFor(history, [
      { id: "human-1" },
      { id: "ai-1" },
      { id: "human-2" },
    ]),
    "c3",
  );
  assert.equal(checkpointFor(history, [{ id: "human-1" }]), "c1");
});

test("of two states with the same messages, the checkpoint is the newest", () => {
  assert.equal(
    checkpointFor(
      [state("late", "human-1"), state("early", "human-1")],
      [{ id: "human-1" }],
    ),
    "late",
  );
});

test("messages that no state holds give no checkpoint", () => {
  assert.equal(checkpointFor(history, [{ id: "human-9" }]), null);
  assert.equal(
    checkpointFor(history, [{ id: "ai-1" }, { id: "human-1" }]),
    null,
  );
});

test("a message with no id gives no checkpoint", () => {
  assert.equal(checkpointFor([state("c0")], []), "c0");
  assert.equal(checkpointFor(history, [{}]), null);
});
