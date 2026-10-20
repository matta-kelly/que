import { test } from "node:test";
import assert from "node:assert/strict";
import { definePlugin } from "./plugin.js";
import { defineCases, validateCases } from "./case.js";

const notes = definePlugin({
  name: "notes",
  title: "Notes",
  description: "How the team writes things down.",
  capabilities: [
    {
      name: "write-up",
      title: "Write up a meeting",
      description: "A person asks for the notes of a meeting and gets them.",
    },
  ],
});

const asked = {
  name: "write-up-asked",
  capability: "write-up",
  input: "Write up the meeting of today.",
  start: "A meeting took place today.",
  good: "The answer holds the notes of the meeting of today.",
};

test("validateCases lists a case with a bad name, and a name used twice", () => {
  assert.throws(
    () =>
      validateCases(
        notes,
        defineCases([{ ...asked, name: "no spaces" }, asked, asked]),
      ),
    (error: Error) => {
      assert.match(error.message, /- no spaces\.name must match/);
      assert.match(error.message, /- write-up-asked is used twice/);
      return true;
    },
  );
});

test("validateCases lists a case with an empty input, start or good, and one with no name or capability", () => {
  assert.throws(
    () =>
      validateCases(notes, [
        { ...asked, input: "", start: "  ", good: "" },
        { ...asked, name: undefined, capability: undefined },
      ] as never),
    (error: Error) => {
      assert.match(error.message, /cases of plugin notes are invalid/);
      assert.match(error.message, /- 1\.name is missing/);
      assert.match(error.message, /- 1\.capability is missing/);
      assert.match(error.message, /- write-up-asked\.input is missing/);
      assert.match(error.message, /- write-up-asked\.start is missing/);
      assert.match(error.message, /- write-up-asked\.good is missing/);
      return true;
    },
  );
});

test("validateCases lists a case with a field that is not one of the five, and one that holds a function", () => {
  assert.throws(
    () =>
      validateCases(notes, [
        { ...asked, grader: "exact" },
        { ...asked, name: "write-up-judged", good: () => true },
      ] as never),
    (error: Error) => {
      assert.match(error.message, /- write-up-asked has no field "grader"/);
      assert.match(error.message, /- write-up-judged\.good must be text/);
      return true;
    },
  );
});

test("validateCases lists a case that names a capability its plugin does not have", () => {
  assert.throws(
    () =>
      validateCases(
        notes,
        defineCases([{ ...asked, capability: "summarize" }]),
      ),
    /- write-up-asked\.capability names "summarize", which plugin notes does not have/,
  );
});
