import { test } from "node:test";
import assert from "node:assert/strict";
import { definePackage, validatePackage } from "./package-spec.js";

const notes = definePackage({
  name: "notes",
  title: "Notes",
  description: "How the team writes things down.",
});

test("definePackage accepts a package that declares only its identity", () => {
  validatePackage(notes);
});

test("a package that declares no operations has none", () => {
  assert.deepEqual(notes.ops, []);
});
