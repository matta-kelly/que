import { test } from "node:test";
import assert from "node:assert/strict";
import { LOOP_DEFAULTS } from "@mku1tra/que-harness";
import { loopFor } from "./loop.js";

const bigResults = {
  name: "big-results",
  type: "loop" as const,
  description: "A loop of a test.",
  result: { max: 500 },
};
const shortRun = {
  name: "short-run",
  type: "loop" as const,
  description: "A loop of a test.",
  summarize: false as const,
};

test("a config that names a loop gets it, with que's own value for what the loop leaves out", () => {
  assert.deepEqual(
    loopFor([shortRun, bigResults], {
      name: "chat",
      type: "agent" as const,
      description: "An agent of a test.",
      plugins: [],
      model: "small",
      loop: "big-results",
    }),
    {
      name: "big-results",
      ...LOOP_DEFAULTS,
      result: { max: 500 },
    },
  );
  assert.deepEqual(
    loopFor([shortRun, bigResults], {
      name: "nightly",
      type: "agent" as const,
      description: "An agent of a test.",
      plugins: [],
      model: "small",
      loop: "short-run",
    }),
    {
      name: "short-run",
      ...LOOP_DEFAULTS,
      summarize: false,
    },
  );
});

test("a config that names a loop the deployment does not list fails", () => {
  assert.throws(
    () =>
      loopFor([shortRun], {
        name: "chat",
        type: "agent" as const,
        description: "An agent of a test.",
        plugins: [],
        model: "small",
        loop: "big-results",
      }),
    /^Error: no loop "big-results"$/,
  );
});
