import { test } from "node:test";
import assert from "node:assert/strict";
import { catalog, mixed } from "../assemble/fixture.js";
import { narrow } from "./catalog.js";

const names = (the: { pkg: { definition: { name: string } } }[]) =>
  the.map(({ pkg }) => pkg.definition.name);

test("with no names, the catalog is the one it was given", () => {
  assert.deepEqual(narrow(mixed), mixed);
});

test("narrowed by a name, the catalog keeps that package and no other", () => {
  assert.deepEqual(narrow(mixed, ["notes"]), [mixed[1]]);
});

test("a name the user cannot reach is not added", () => {
  assert.deepEqual(names(narrow(catalog, ["shop", "notes"])), ["shop"]);
});

test("narrowed by only a name the user cannot reach, the catalog is empty", () => {
  assert.deepEqual(narrow(catalog, ["notes"]), []);
});
