import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LOOP_DEFAULTS,
  defineLoop,
  resolveLoop,
  validateLoop,
} from "./loop-spec.js";

const faults = (def: unknown) => {
  try {
    validateLoop(def);
  } catch (error) {
    return (error as Error).message;
  }
  return "";
};

test("validateLoop accepts a name and every setting", () => {
  validateLoop(
    defineLoop({
      name: "long-chat",
      engine: "deepagents",
      result: { max: 20_000 },
      summarize: { at: 0.85, keep: 0.1 },
      args: { max: 2_000 },
      limits: { modelCalls: 50, toolCalls: 100 },
    }),
  );
});

test("validateLoop accepts each engine que has, and rejects another, listing the ones it has", () => {
  validateLoop({ name: "a", engine: "plain" });
  validateLoop({ name: "b", engine: "deepagents" });
  for (const engine of ["deep", "", 7, null]) {
    const message = faults({ name: "odd", engine });
    assert.match(message, /engine of the loop must be one of/);
    assert.match(message, /plain/);
    assert.match(message, /deepagents/);
  }
});

test("resolveLoop gives plain to a loop that names no engine", () => {
  assert.equal(resolveLoop({ name: "a" }).engine, "plain");
  assert.equal(
    resolveLoop({ name: "b", engine: "deepagents" }).engine,
    "deepagents",
  );
});

test("validateLoop accepts a loop with only a name", () => {
  validateLoop({ name: "plain" });
});

test("validateLoop accepts a setting that is false", () => {
  validateLoop({
    name: "bare",
    result: false,
    summarize: false,
    args: false,
    limits: false,
  });
});

test("validateLoop rejects a loop with no name, and a name that is not a plain name", () => {
  assert.match(faults({}), /name of the loop is missing/);
  assert.match(faults({ name: " " }), /name of the loop is missing/);
  assert.match(faults({ name: "two words" }), /loop name "two words"/);
});

test("validateLoop rejects a field that is not in the shape, at the top and inside a setting, naming it", () => {
  assert.match(
    faults({ name: "odd", compact: true }),
    /the loop has no field "compact"/,
  );
  assert.match(
    faults({ name: "odd", summarize: { after: 0.5 } }),
    /summarize of the loop has no field "after"/,
  );
  assert.match(
    faults({ name: "odd", limits: { seconds: 30 } }),
    /limits of the loop has no field "seconds"/,
  );
});

test("validateLoop rejects a setting that is not an object or false", () => {
  for (const setting of ["result", "summarize", "args", "limits"])
    for (const value of [true, 20_000, "off", null, []])
      assert.match(
        faults({ name: "odd", [setting]: value }),
        new RegExp(`${setting} of the loop must be an object or false`),
        `${setting}: ${JSON.stringify(value)}`,
      );
});

test("validateLoop rejects a count that is not a whole number above zero", () => {
  const counts: [string, string][] = [
    ["result", "max"],
    ["args", "max"],
    ["limits", "modelCalls"],
    ["limits", "toolCalls"],
  ];
  for (const [setting, field] of counts)
    for (const value of [0, -1, 1.5, "50", Number.NaN])
      assert.match(
        faults({ name: "odd", [setting]: { [field]: value } }),
        new RegExp(
          `${setting}\\.${field} of the loop must be a whole number above zero`,
        ),
        `${setting}.${field}: ${String(value)}`,
      );
});

test("validateLoop rejects a share that is not between zero and one, and a keep that is not below at", () => {
  for (const field of ["at", "keep"])
    for (const value of [0, 1, 1.2, -0.1, "0.5"])
      assert.match(
        faults({ name: "odd", summarize: { [field]: value } }),
        new RegExp(
          `summarize\\.${field} of the loop must be a number above zero and below one`,
        ),
        `summarize.${field}: ${String(value)}`,
      );
  const below = /summarize\.keep of the loop must be below summarize\.at/;
  assert.match(
    faults({ name: "odd", summarize: { at: 0.5, keep: 0.5 } }),
    below,
  );
  assert.match(
    faults({ name: "odd", summarize: { at: 0.5, keep: 0.6 } }),
    below,
  );
  // que's own keep is 0.1, so an `at` under it leaves nothing to summarize.
  assert.match(faults({ name: "odd", summarize: { at: 0.05 } }), below);
});

test("validateLoop names every fault in one error", () => {
  const message = faults({
    name: "odd",
    compact: true,
    result: { max: 0 },
    summarize: { at: 2 },
    args: "none",
    limits: { toolCalls: 1.5 },
  });
  assert.match(message, /no field "compact"/);
  assert.match(message, /result\.max/);
  assert.match(message, /summarize\.at/);
  assert.match(message, /args of the loop/);
  assert.match(message, /limits\.toolCalls/);
});

test("validateLoop names the loop in its error", () => {
  assert.match(faults({ name: "odd", compact: true }), /^loop odd is invalid/);
  assert.match(faults({ compact: true }), /^loop is invalid/);
});

test("validateLoop rejects what is not an object", () => {
  for (const def of [undefined, null, "long-chat", []])
    assert.match(faults(def), /loop must be an object/);
});

test("resolveLoop gives que's own value for each setting a loop leaves out", () => {
  assert.deepEqual(resolveLoop({ name: "plain" }), {
    name: "plain",
    engine: "plain",
    result: { max: 20_000 },
    summarize: { at: 0.85, keep: 0.1 },
    args: { max: 2_000 },
    limits: { modelCalls: 50, toolCalls: 100 },
  });
  assert.deepEqual(resolveLoop({ name: "plain" }), {
    name: "plain",
    engine: "plain",
    ...LOOP_DEFAULTS,
  });
});

test("resolveLoop keeps a loop's own value, and a setting that is false", () => {
  assert.deepEqual(
    resolveLoop({
      name: "short-run",
      result: { max: 60_000 },
      summarize: false,
      args: false,
      limits: { modelCalls: 15, toolCalls: 30 },
    }),
    {
      name: "short-run",
      engine: "plain",
      result: { max: 60_000 },
      summarize: false,
      args: false,
      limits: { modelCalls: 15, toolCalls: 30 },
    },
  );
});

test("resolveLoop fills the part of a setting a loop leaves out", () => {
  const loop = resolveLoop({
    name: "part",
    summarize: { at: 0.6 },
    limits: { modelCalls: 15 },
  });
  assert.deepEqual(loop.summarize, { at: 0.6, keep: 0.1 });
  assert.deepEqual(loop.limits, { modelCalls: 15, toolCalls: 100 });
});

test("resolveLoop hands back settings a caller can change with no effect on que's own", () => {
  const loop = resolveLoop({ name: "plain" });
  (loop.result as { max: number }).max = 1;
  assert.deepEqual(resolveLoop({ name: "plain" }).result, { max: 20_000 });
});
