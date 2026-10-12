import { test } from "node:test";
import assert from "node:assert/strict";
import { systemPrompt } from "./system-prompt.js";
import { catalog } from "./fixture.js";

const prompt = systemPrompt({
  user: { name: "Ann User", email: "ann@example.test" },
  catalog,
});

test("says what a package is and how to reach an operation", () => {
  assert.match(prompt, /package/i);
  assert.match(prompt, /open_package/);
  assert.match(prompt, /load_operation/);
});

test("lists each of the user's packages by its own name, title and description", () => {
  assert.match(prompt, /Shop/);
  assert.match(prompt, /`shop`/);
  assert.match(prompt, /The shop's order system\./);
});

test("says who the user is, in que and in the package", () => {
  assert.match(prompt, /Ann User/);
  assert.match(prompt, /User Seven/);
});

test("names no operation and no skill", () => {
  assert.doesNotMatch(prompt, /findOrders|getOrder|shop\/refunds/);
});

test("mentions read_skill only when a package has a skill", () => {
  assert.match(prompt, /read_skill/);
  const noSkills = [{ ...catalog[0], pkg: { ...catalog[0].pkg, skills: [] } }];
  assert.doesNotMatch(systemPrompt({ catalog: noSkills }), /read_skill/);
});

test("says so when the user has no packages", () => {
  const empty = systemPrompt({ catalog: [] });
  assert.match(empty, /no packages/i);
  assert.doesNotMatch(empty, /open_package/);
});
