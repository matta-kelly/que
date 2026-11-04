import { test } from "vitest";
import assert from "node:assert/strict";
import { messageGroupBy } from "./thread.aui";

/**
 * A reply's parts, grouped: a call that waits for a yes is the card's own row, so it sits outside the collapsed steps.
 * Every other step stays in them, and a call with no waiting approval is grouped as it was.
 */
type Part = Parameters<typeof messageGroupBy>[0];

const call = (overrides: Partial<Part> = {}): Part =>
  ({
    type: "tool-call",
    toolCallId: "c1",
    toolName: "till-void",
    args: { item: "hat" },
    argsText: '{"item":"hat"}',
    status: { type: "complete" },
    ...overrides,
  }) as Part;

const reasoning = {
  type: "reasoning",
  text: "The till holds it, so void it.",
  status: { type: "complete" },
} as Part;

test("given a reply whose tool call waits for a yes, when its parts are grouped, then the call is outside the steps, the other steps stay in them, and a call with no waiting approval is grouped as today", () => {
  assert.deepEqual(
    messageGroupBy(
      call({ approval: { id: "i1", prompt: "Void: run till-void?" } }),
    ),
    [],
    "a call waiting for a yes was put inside the chain of thought",
  );
  assert.deepEqual(
    messageGroupBy(reasoning),
    ["group-chainOfThought", "group-reasoning"],
    "a reasoning step left the chain of thought",
  );
  assert.deepEqual(
    messageGroupBy(call()),
    ["group-chainOfThought", "group-tool"],
    "a call with no waiting approval left the chain of thought",
  );
  assert.deepEqual(
    messageGroupBy(call({ approval: { id: "i2", approved: false } })),
    ["group-chainOfThought", "group-tool"],
    "a call whose approval was answered stayed outside the steps",
  );
});
