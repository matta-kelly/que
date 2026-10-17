import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSkill } from "./skill-spec.js";

test("parseSkill rejects a skill with no description, naming the skill", () => {
  assert.throws(
    () => parseSkill("notes/greet", "---\ntitle: Greet\n---\nSay hello."),
    /notes\/greet/,
  );
});
