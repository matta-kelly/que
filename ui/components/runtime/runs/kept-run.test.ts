import { test } from "vitest";
import assert from "node:assert/strict";
import { keptRun } from "./kept-run.ts";

test("keptRun joins a run that is going, and lets go of one that has ended", () => {
  assert.equal(keptRun({ status: "pending" }), "join");
  assert.equal(keptRun({ status: "running" }), "join");
  assert.equal(keptRun({ status: "success" }), "forget");
});

test("keptRun lets go of a run the server does not have, and keeps it when the server does not answer", () => {
  assert.equal(keptRun({ error: { status: 404 } }), "forget");
  assert.equal(keptRun({ error: { status: 502 } }), "keep");
  assert.equal(keptRun({ error: new TypeError("Failed to fetch") }), "keep");
});
