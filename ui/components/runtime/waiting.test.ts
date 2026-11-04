import { test } from "vitest";
import assert from "node:assert/strict";
import type { ThreadMessageLike } from "@assistant-ui/react";
import { waitingOn } from "./waiting.ts";

const asked: ThreadMessageLike = {
  id: "u1",
  role: "user",
  content: [{ type: "text", text: "Void the hat." }],
};
const reply: ThreadMessageLike = {
  id: "a1",
  role: "assistant",
  content: [
    { type: "text", text: "Voiding. " },
    {
      type: "tool-call",
      toolCallId: "c1",
      toolName: "till-void",
      args: { item: "hat" },
      argsText: '{"item":"hat"}',
    },
  ],
};
const interrupt = {
  id: "i1",
  reason: "tool_call",
  toolCallId: "c1",
  message: "Void: run till-void with this input?",
  responseSchema: {
    oneOf: [
      { required: ["type"], properties: { type: { const: "approve" } } },
      { required: ["type"], properties: { type: { const: "edit" } } },
      { required: ["type"], properties: { type: { const: "reject" } } },
    ],
  },
  metadata: {
    plugin: "till",
    op: "till-void",
    input: { item: "hat" },
    decisions: ["approve", "edit", "reject"],
  },
};

test("given a reply whose run waits on a tool_call interrupt, then the reply asks for action, holds the interrupt, and its tool call carries the approval with the decisions the op allows", () => {
  const [, marked] = waitingOn([asked, reply], [interrupt]);
  assert.deepEqual(marked, {
    ...reply,
    status: { type: "requires-action", reason: "interrupt" },
    metadata: { custom: { agui: { interrupts: [interrupt] } } },
    content: [
      { type: "text", text: "Voiding. " },
      {
        type: "tool-call",
        toolCallId: "c1",
        toolName: "till-void",
        args: { item: "hat" },
        argsText: '{"item":"hat"}',
        approval: {
          id: "i1",
          prompt: interrupt.message,
          decisions: ["approve", "edit", "reject"],
        },
      },
    ],
  });
});

test("given no interrupts, then the messages are as they were", () => {
  const messages = [asked, reply];
  assert.equal(waitingOn(messages, []), messages);
});
