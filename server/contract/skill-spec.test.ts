import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSkill } from "./skill-spec.js";

test("parseSkill gives a skill its id, title, description and body", () => {
  assert.deepEqual(
    parseSkill(
      "notes/greet",
      "---\ntitle: Greet\ndescription: How to greet a customer.\n---\nSay hello.",
    ),
    {
      id: "notes/greet",
      title: "Greet",
      description: "How to greet a customer.",
      body: "Say hello.",
    },
  );
});

test("parseSkill rejects a skill with no title, naming the skill", () => {
  assert.throws(
    () =>
      parseSkill(
        "notes/greet",
        "---\ndescription: How to greet a customer.\n---\nSay hello.",
      ),
    /notes\/greet/,
  );
});

test("parseSkill rejects a skill with no description, naming the skill", () => {
  assert.throws(
    () => parseSkill("notes/greet", "---\ntitle: Greet\n---\nSay hello."),
    /notes\/greet/,
  );
});

test("parseSkill rejects a skill with no frontmatter, naming the skill", () => {
  assert.throws(() => parseSkill("notes/greet", "Say hello."), /notes\/greet/);
});
