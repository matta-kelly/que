import { test } from "node:test";
import assert from "node:assert/strict";
import { defineLoop, resolveLoop } from "./loop.ts";

test("resolveLoop fills the part of a setting a loop leaves out", () => {
  const loop = resolveLoop(
    defineLoop({
      name: "part",
      type: "loop",
      description: "A loop that sets part of two settings.",
      summarize: { at: 0.6 },
      limits: { modelCalls: 15 },
    }),
  );
  assert.deepEqual(loop.summarize, { at: 0.6, keep: 0.1 });
  assert.deepEqual(loop.limits, { modelCalls: 15, toolCalls: 100 });
});
