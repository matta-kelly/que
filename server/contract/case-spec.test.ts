import { test } from "node:test";
import assert from "node:assert/strict";
import { definePackage } from "./package-spec.js";
import { defineCases, validateCases } from "./case-spec.js";

const notes = definePackage({
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

test("validateCases accepts a package with no cases", () => {
  validateCases(notes, defineCases([]));
});

test("validateCases accepts a case that names a capability of the package", () => {
  validateCases(notes, defineCases([asked]));
});

test("validateCases lists a case with a bad name, and a name used twice", () => {
  assert.throws(
    () =>
      validateCases(
        notes,
        defineCases([{ ...asked, name: "no spaces" }, asked, asked]),
      ),
    (error: Error) => {
      assert.match(error.message, /case name "no spaces" must match/);
      assert.match(error.message, /case name "write-up-asked" is used twice/);
      return true;
    },
  );
});

test("validateCases lists a case that names a capability the package does not have", () => {
  assert.throws(
    () =>
      validateCases(notes, defineCases([{ ...asked, capability: "refund" }])),
    /case write-up-asked names the capability "refund", which package notes does not have/,
  );
});

test("validateCases lists a case with an empty input, start or good", () => {
  assert.throws(
    () =>
      validateCases(
        notes,
        defineCases([{ ...asked, input: "", start: "  ", good: "" }]),
      ),
    (error: Error) => {
      assert.match(error.message, /input of case write-up-asked is missing/);
      assert.match(error.message, /start of case write-up-asked is missing/);
      assert.match(error.message, /good of case write-up-asked is missing/);
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
      assert.match(error.message, /case write-up-asked has a field "grader"/);
      assert.match(error.message, /good of case write-up-judged must be text/);
      return true;
    },
  );
});

test("validateCases names the package in its error", () => {
  assert.throws(
    () => validateCases(notes, defineCases([{ ...asked, input: "" }])),
    (error: Error) => {
      assert.match(error.message, /^cases of package notes are invalid/);
      return true;
    },
  );
});
