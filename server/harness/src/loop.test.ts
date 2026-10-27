import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLoop, validateLoop } from "./loop.ts";

const faults = (def: unknown) => {
  try {
    validateLoop(def);
  } catch (error) {
    return (error as Error).message;
  }
  return "";
};

test("validateLoop rejects a loop with no name, and a name that is not a plain name", () => {
  assert.match(faults({}), /^loop is invalid:\n- name is missing/);
  assert.match(faults({ name: " " }), /- name is missing/);
  assert.match(
    faults({ name: "two words" }),
    /- name must be lowercase letters and digits/,
  );
});

test("validateLoop rejects a field that is not in the shape, at the top and inside a setting, naming it", () => {
  assert.match(
    faults({ name: "odd", compact: true }),
    /^loop odd is invalid:\n- has no field "compact"/,
  );
  assert.match(
    faults({ name: "odd", summarize: { after: 0.5 } }),
    /- summarize has no field "after"/,
  );
  assert.match(
    faults({ name: "odd", limits: { seconds: 30 } }),
    /- limits has no field "seconds"/,
  );
});

test("validateLoop rejects a setting that is not an object or false", () => {
  for (const setting of ["result", "summarize", "args", "limits"])
    for (const value of [true, 20_000, "off", null, []])
      assert.match(
        faults({ name: "odd", [setting]: value }),
        new RegExp(`- ${setting} must be an object or false`),
        `${setting}: ${JSON.stringify(value)}`,
      );
});

test("validateLoop rejects a share that is not between zero and one, and a keep that is not below at", () => {
  for (const field of ["at", "keep"])
    for (const value of [0, 1, 1.2, -0.1, "0.5"])
      assert.match(
        faults({ name: "odd", summarize: { [field]: value } }),
        new RegExp(
          `- summarize\\.${field} must be a number above zero and below one`,
        ),
        `summarize.${field}: ${String(value)}`,
      );
  const below = /- summarize\.keep must be below summarize\.at/;
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
  assert.match(message, /- has no field "compact"/);
  assert.match(message, /- result\.max must be/);
  assert.match(message, /- summarize\.at must be/);
  assert.match(message, /- args must be an object or false/);
  assert.match(message, /- limits\.toolCalls must be/);
});

test("validateLoop rejects what is not an object", () => {
  for (const def of [undefined, null, "long-chat", []])
    assert.match(faults(def), /^loop is invalid:\n- must be an object/);
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
