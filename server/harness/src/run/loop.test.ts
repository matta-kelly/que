import { test } from "node:test";
import assert from "node:assert/strict";
import { LOOP_DEFAULTS } from "@que/core";
import { loopFor } from "./loop.js";

const deep = {
  name: "deep",
  engine: "deepagents" as const,
  result: { max: 500 },
};
const shortRun = { name: "short-run", summarize: false as const };

test("a config that names a loop gets it, with que's own value for what the loop leaves out", () => {
  assert.deepEqual(loopFor([shortRun, deep], { name: "chat", loop: "deep" }), {
    name: "deep",
    engine: "deepagents",
    ...LOOP_DEFAULTS,
    result: { max: 500 },
  });
  assert.deepEqual(
    loopFor([shortRun, deep], { name: "nightly", loop: "short-run" }),
    {
      name: "short-run",
      engine: "plain",
      ...LOOP_DEFAULTS,
      summarize: false,
    },
  );
});

test("a config that names no loop gets plain", () => {
  const loop = loopFor([shortRun, deep], { name: "chat" });
  assert.equal(loop.engine, "plain");
  assert.deepEqual(loop, {
    name: "default",
    engine: "plain",
    ...LOOP_DEFAULTS,
  });
  assert.equal(loopFor([], { name: "default" }).engine, "plain");
});
