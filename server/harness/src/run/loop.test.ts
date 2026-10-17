import { test } from "node:test";
import assert from "node:assert/strict";
import { LOOP_DEFAULTS } from "@que/core";
import { loopFor } from "./loop.js";

const bigResults = { name: "big-results", result: { max: 500 } };
const shortRun = { name: "short-run", summarize: false as const };

test("a config that names a loop gets it, with que's own value for what the loop leaves out", () => {
  assert.deepEqual(
    loopFor([shortRun, bigResults], {
      name: "chat",
      packages: [],
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
      packages: [],
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
        packages: [],
        model: "small",
        loop: "big-results",
      }),
    /^Error: no loop "big-results"$/,
  );
});
