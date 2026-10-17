import { test } from "node:test";
import assert from "node:assert/strict";
import { mixed } from "../assemble/fixture.js";
import { narrow } from "./narrow.js";

test("with no names, the catalog has no package", () => {
  assert.deepEqual(narrow(mixed, []), []);
});

test("narrowed by a name, the catalog keeps that package and no other", () => {
  assert.deepEqual(narrow(mixed, ["notes"]), [mixed[1]]);
});
