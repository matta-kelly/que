import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSkill } from "./skill.js";

test("parseSkill rejects a skill with no title or no description, naming the skill and the field", () => {
  assert.throws(
    () => parseSkill("notes/greet", "---\ntitle: Greet\n---\nSay hello."),
    /skill notes\/greet is invalid:\n- description is missing/,
  );
  assert.throws(
    () =>
      parseSkill("notes/greet", "---\ndescription: Say hello.\ntitle:\n---\n"),
    /skill notes\/greet is invalid:\n- title is missing/,
  );
});

test("parseSkill reads the title, description and body of a skill", () => {
  assert.deepEqual(
    parseSkill(
      "notes/greet",
      "---\ntitle: Greet\ndescription: Say hello.\n---\nSay hello.\n",
    ),
    {
      id: "notes/greet",
      title: "Greet",
      description: "Say hello.",
      body: "Say hello.",
    },
  );
});
