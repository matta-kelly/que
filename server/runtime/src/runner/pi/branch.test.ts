/**
 * The branch rule's fork point, on the messages a conversation holds: a fork keeps its parent's entries up to the
 * entry it is made at, so a fork that keeps a message is made at the last entry that message is made of. An
 * assistant message is made of its own entry and the later write that records its id; a tool message, of its result.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { EntryId } from "@earendil-works/pi-durable";
import type { Held } from "./agui.js";
import { branchOf } from "./branch.js";

const at = (n: number) => n as unknown as EntryId;
const userAt = (id: string, n: number): Held => ({
  message: { id, role: "user", content: id },
  at: at(n),
  run: `run-${id}`,
});
const assistantAt = (id: string, n: number, calls: string[] = []): Held => ({
  message: {
    id,
    role: "assistant",
    content: "",
    ...(calls.length
      ? {
          toolCalls: calls.map((call) => ({
            id: call,
            type: "function" as const,
            function: { name: "till-count", arguments: "{}" },
          })),
        }
      : {}),
  },
  at: at(n),
});
const toolAt = (call: string, n: number): Held => ({
  message: { id: call, role: "tool", toolCallId: call, content: "" },
  at: at(n),
});

test("given a turn stopped after its tool ran, whose assistant message's id was written after the tool result, when an edit of the next message forks at that turn, then the fork is made at the id's write, so the fork shows the assistant message too", () => {
  // u1, then a1's entry (2) with its call, the result (3), a1's id written (4); then u2 and its answer.
  const oneCall = [
    userAt("u1", 1),
    assistantAt("a1", 4, ["c1"]),
    toolAt("c1", 3),
    userAt("u2", 5),
    assistantAt("a2", 7),
  ];
  // Two calls in the turn: both results (3, 4) before a1's id (5).
  const twoCalls = [
    userAt("u1", 1),
    assistantAt("a1", 5, ["c1", "c2"]),
    toolAt("c1", 3),
    toolAt("c2", 4),
    userAt("u2", 6),
    assistantAt("a2", 8),
  ];
  // The id written before the result, as when the tool takes its time: the fork is at the result.
  const idFirst = [
    userAt("u1", 1),
    assistantAt("a1", 3, ["c1"]),
    toolAt("c1", 4),
    userAt("u2", 5),
    assistantAt("a2", 7),
  ];
  const edit = (before: string[]) => ({
    runId: "run-edit",
    before,
    last: "u2-edited",
  });
  assert.deepEqual(
    {
      oneCall: branchOf(oneCall, edit(["u1", "a1", "c1"])),
      twoCalls: branchOf(twoCalls, edit(["u1", "a1", "c1", "c2"])),
      idFirst: branchOf(idFirst, edit(["u1", "a1", "c1"])),
    },
    {
      oneCall: { kind: "fork", at: at(4) },
      twoCalls: { kind: "fork", at: at(5) },
      idFirst: { kind: "fork", at: at(4) },
    },
  );
});
