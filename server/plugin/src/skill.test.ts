import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSkill } from "./skill.ts";

test("parseSkill reads a skill in the Agent Skills format, with its title from metadata", () => {
  assert.deepEqual(
    parseSkill(
      "greet",
      "---\nname: greet\ndescription: Say hello.\nmetadata:\n  title: Greet\n---\nSay hello.\n",
    ),
    {
      name: "greet",
      type: "skill",
      title: "Greet",
      description: "Say hello.",
      body: "Say hello.",
    },
  );
});

test("parseSkill gives a skill with no metadata title its name as its title", () => {
  assert.equal(
    parseSkill("greet", "---\nname: greet\ndescription: Say hello.\n---\n")
      .title,
    "greet",
  );
});

test("parseSkill takes the standard's other fields, and does not read them", () => {
  assert.deepEqual(
    parseSkill(
      "greet",
      "---\nname: greet\ndescription: Say hello.\nlicense: MIT\ncompatibility: Needs a network.\n---\n",
    ),
    {
      name: "greet",
      type: "skill",
      title: "greet",
      description: "Say hello.",
      body: "",
    },
  );
});

/** The names a skill gives as its uses, none when it gives no list. */
const usesOf = (skill: object) => (skill as { uses?: string[] }).uses ?? [];

test("parseSkill gives the names in allowed-tools, space-separated, as the skill's uses, and a skill with none no uses", () => {
  assert.deepEqual(
    parseSkill(
      "greet",
      "---\nname: greet\ndescription: Say hello.\nallowed-tools: notes-find notes-write\n---\nSay hello.\n",
    ),
    {
      name: "greet",
      type: "skill",
      title: "greet",
      description: "Say hello.",
      uses: ["notes-find", "notes-write"],
      body: "Say hello.",
    },
  );
  const cases: [string, string[]][] = [
    ["notes-find", ["notes-find"]],
    [
      "odoo-search notes-find warehouse-get-fabric",
      ["odoo-search", "notes-find", "warehouse-get-fabric"],
    ],
    ['"  odoo-search   notes-find "', ["odoo-search", "notes-find"]],
  ];
  for (const [given, uses] of cases)
    assert.deepEqual(
      usesOf(
        parseSkill(
          "greet",
          `---\nname: greet\ndescription: Say hello.\nallowed-tools: ${given}\n---\n`,
        ),
      ),
      uses,
      `allowed-tools: ${given}`,
    );
  // None: no allowed-tools, or a blank one.
  assert.equal(
    "uses" in
      parseSkill("greet", "---\nname: greet\ndescription: Say hello.\n---\n"),
    false,
  );
  for (const blank of ['""', '"   "'])
    assert.equal(
      "uses" in
        parseSkill(
          "greet",
          `---\nname: greet\ndescription: Say hello.\nallowed-tools: ${blank}\n---\n`,
        ),
      false,
      `allowed-tools: ${blank}`,
    );
});

test("parseSkill rejects a skill with no description, naming the skill and the field", () => {
  assert.throws(
    () => parseSkill("greet", "---\nname: greet\n---\nSay hello."),
    /skill greet is invalid:\n- description is missing/,
  );
});

test("parseSkill rejects a skill whose name is not its folder's", () => {
  assert.throws(
    () =>
      parseSkill("greet", "---\nname: wave\ndescription: Say hello.\n---\n"),
    /skill greet is invalid:\n- name must be its folder's name, greet/,
  );
});

test("parseSkill rejects a skill name the standard does not take", () => {
  assert.throws(
    () =>
      parseSkill("Greet", "---\nname: Greet\ndescription: Say hello.\n---\n"),
    /- name must be lowercase letters and digits, with single hyphens between them, got "Greet"/,
  );
});

test("parseSkill rejects a skill with no frontmatter", () => {
  assert.throws(
    () => parseSkill("greet", "Say hello."),
    /skill greet is invalid:\n- frontmatter is missing \(a --- fenced YAML block at the top\)/,
  );
});

test("parseSkill rejects frontmatter that is not YAML", () => {
  assert.throws(
    () => parseSkill("greet", "---\nname: [greet\n---\n"),
    /skill greet is invalid:\n- The frontmatter is not valid YAML/,
  );
});

test("parseSkill reads a SKILL.md with \\r\\n line ends", () => {
  assert.equal(
    parseSkill(
      "greet",
      "---\r\nname: greet\r\ndescription: Say hello.\r\n---\r\nSay hello.\r\n",
    ).description,
    "Say hello.",
  );
});

test("parseSkill rejects frontmatter that is YAML but not a map of fields", () => {
  assert.throws(
    () => parseSkill("greet", "---\nhello\n---\n"),
    /skill greet is invalid:\n- The frontmatter is not a set of fields\./,
  );
});

test("parseSkill rejects a description over 1024 characters, and metadata that is not text", () => {
  assert.throws(
    () =>
      parseSkill(
        "greet",
        `---\nname: greet\ndescription: ${"a".repeat(1025)}\nmetadata:\n  title: 7\n---\n`,
      ),
    (error: Error) => {
      assert.match(
        error.message,
        /- description must be at most 1024 characters/,
      );
      assert.match(error.message, /- metadata\.title /);
      return true;
    },
  );
});
