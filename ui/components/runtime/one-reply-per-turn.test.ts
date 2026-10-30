import { test } from "vitest";
import assert from "node:assert/strict";
import type { ThreadMessageLike } from "@assistant-ui/react";
import { oneReplyPerTurn } from "./one-reply-per-turn.ts";

const user = (id: string, text: string): ThreadMessageLike => ({
  id,
  role: "user",
  content: [{ type: "text", text }],
});
const call = (toolCallId: string) => ({
  type: "tool-call" as const,
  toolCallId,
  toolName: "till-count",
  args: { item: "pens" },
  argsText: '{"item":"pens"}',
  result: { count: 3 },
});

test("assistant messages one after another join into one, under the first one's id, their parts in the order they came", () => {
  const joined = oneReplyPerTurn([
    user("u1", "How many pens?"),
    {
      id: "a1",
      role: "assistant",
      content: [{ type: "text", text: "Let me count. " }, call("c1")],
    },
    {
      id: "a2",
      role: "assistant",
      content: [call("c2")],
    },
    {
      id: "a3",
      role: "assistant",
      content: [{ type: "text", text: "There are 3." }],
    },
  ]);
  assert.deepEqual(joined, [
    user("u1", "How many pens?"),
    {
      id: "a1",
      role: "assistant",
      content: [
        { type: "text", text: "Let me count. " },
        call("c1"),
        call("c2"),
        { type: "text", text: "There are 3." },
      ],
    },
  ]);
});

test("a user message ends a turn: each turn is its own reply, under its own first id", () => {
  const joined = oneReplyPerTurn([
    user("u1", "How many pens?"),
    { id: "a1", role: "assistant", content: [call("c1")] },
    { id: "a2", role: "assistant", content: [{ type: "text", text: "3." }] },
    user("u2", "And ink?"),
    { id: "b1", role: "assistant", content: [call("c2")] },
    { id: "b2", role: "assistant", content: [{ type: "text", text: "2." }] },
    user("u3", "Thanks."),
    { id: "d1", role: "assistant", content: [{ type: "text", text: "OK." }] },
  ]);
  assert.deepEqual(
    joined.map((m) => [m.role, m.id]),
    [
      ["user", "u1"],
      ["assistant", "a1"],
      ["user", "u2"],
      ["assistant", "b1"],
      ["user", "u3"],
      ["assistant", "d1"],
    ],
  );
  assert.deepEqual(joined[3].content, [
    call("c2"),
    { type: "text", text: "2." },
  ]);
});

test("an assistant message whose content is a string joins as a text part", () => {
  const joined = oneReplyPerTurn([
    user("u1", "How many pens?"),
    { id: "a1", role: "assistant", content: "Let me count. " },
    { id: "a2", role: "assistant", content: [call("c1")] },
    { id: "a3", role: "assistant", content: "There are 3." },
  ]);
  assert.deepEqual(joined.at(-1), {
    id: "a1",
    role: "assistant",
    content: [
      { type: "text", text: "Let me count. " },
      call("c1"),
      { type: "text", text: "There are 3." },
    ],
  });
  assert.equal(joined.length, 2);
});
