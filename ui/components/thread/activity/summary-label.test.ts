import { test } from "node:test";
import assert from "node:assert/strict";
import { summaryLabel } from "./summary-label.ts";

test("summaryLabel counts the steps of a turn that is done, with no s for one step", () => {
  assert.equal(summaryLabel(3, false), "3 steps");
  assert.equal(summaryLabel(1, false), "1 step");
});

test("summaryLabel shows no count while the turn runs", () => {
  assert.equal(summaryLabel(3, true), "Working…");
});
