import { test } from "node:test";
import assert from "node:assert/strict";
import { defineCases, readCases } from "./case.ts";

const asked = {
  name: "write-up-asked",
  type: "case" as const,
  description: "A behaviour of its capability.",
  capability: "write-up",
  input: "Write up the meeting of today.",
  start: "A meeting took place today.",
  good: "The answer holds the notes of the meeting of today.",
};

test("defineCases gives each case as its node", () => {
  assert.deepEqual(defineCases([asked]), [asked]);
});

test("defineCases lists every fault, each after the case it is in", () => {
  assert.throws(
    () =>
      defineCases([
        { ...asked, good: "" },
        { ...asked, name: "write-up-told", start: "" },
      ]),
    {
      message: [
        "cases are invalid:",
        "- write-up-asked good is missing",
        "- write-up-told start is missing",
      ].join("\n"),
    },
  );
});

test("readCases reads cases by their shape, as another copy of the package makes them, and lists each fault", () => {
  assert.deepEqual(readCases([{ ...asked }]), { cases: [asked], faults: [] });
  assert.deepEqual(readCases({}), { cases: [], faults: ["must be an array"] });
});
