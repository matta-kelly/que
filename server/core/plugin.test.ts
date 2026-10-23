import { test } from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import { definePlugin, validatePlugin } from "./plugin.js";

const notes = definePlugin({
  name: "notes",
  title: "Notes",
  description: "How the team writes things down.",
});

const search = {
  name: "search",
  title: "Search notes",
  description: "Find notes by a word.",
  schema: z.object({ word: z.string().describe("The word to find") }),
  run: async () => [],
};

test("validatePlugin refuses a plugin with no definition", () => {
  assert.throws(
    () => validatePlugin(undefined),
    /plugin is invalid:\n- no definition \(default export\)/,
  );
});

test("validatePlugin lists a plugin with a bad name, no title and no description", () => {
  assert.throws(
    () =>
      validatePlugin({
        ...notes,
        name: "no spaces",
        title: "",
        description: undefined,
      } as never),
    (error: Error) => {
      assert.match(error.message, /plugin is invalid/);
      assert.match(
        error.message,
        /- name must be lowercase letters and digits, with single hyphens between them, got "no spaces"/,
      );
      assert.match(error.message, /- title is missing/);
      assert.match(error.message, /- description is missing/);
      return true;
    },
  );
  assert.throws(
    () => validatePlugin({ ...notes, name: "" }),
    /plugin is invalid:\n- name is missing/,
  );
});

// What validatePlugin says of a plugin name that is not lowercase words joined by single hyphens.
const notAName = (got: string) => (error: Error) =>
  error.message.includes(
    `- name must be lowercase letters and digits, with single hyphens between them, got "${got}"`,
  );

test("validatePlugin refuses a plugin name that is not lowercase words joined by single hyphens", () => {
  assert.throws(
    () => validatePlugin({ ...notes, name: "Notes" }),
    notAName("Notes"),
  );
  assert.throws(
    () => validatePlugin({ ...notes, name: "my_notes" }),
    notAName("my_notes"),
  );
  assert.throws(
    () => validatePlugin({ ...notes, name: "my.notes" }),
    notAName("my.notes"),
  );
  assert.throws(
    () => validatePlugin({ ...notes, name: "my--notes" }),
    notAName("my--notes"),
  );
  assert.throws(
    () => validatePlugin({ ...notes, name: "-notes" }),
    notAName("-notes"),
  );
});

test("validatePlugin refuses a plugin name over 64 characters", () => {
  assert.throws(
    () => validatePlugin({ ...notes, name: "n".repeat(65) }),
    /- name must be at most 64 characters/,
  );
});

test("validatePlugin takes a plugin name of lowercase words joined by single hyphens", () => {
  assert.doesNotThrow(() =>
    validatePlugin({ ...notes, name: "fabric-to-odoo2" }),
  );
});

test("validatePlugin lists ops, skills or capabilities that are not a list, and a connect or whoami that is not a function", () => {
  assert.throws(
    () =>
      validatePlugin({
        ...notes,
        ops: undefined,
        skills: "greet",
        capabilities: {},
        connect: "odoo",
        whoami: 1,
      } as never),
    (error: Error) => {
      for (const field of ["ops", "skills", "capabilities"])
        assert.match(error.message, new RegExp(`- ${field} must be an array`));
      assert.match(error.message, /- connect must be a function/);
      assert.match(error.message, /- whoami must be a function/);
      return true;
    },
  );
});

test("validatePlugin lists an op with a bad name, a name used twice, no title or description, a schema that is not a zod object, and a field with no description", () => {
  assert.throws(
    () =>
      validatePlugin(
        definePlugin({
          ...notes,
          ops: [
            { ...search, name: "no spaces" },
            search,
            { ...search, title: "", description: " " },
            {
              ...search,
              name: "read",
              schema: z.object({ id: z.number() }),
            },
            { ...search, name: "write", schema: { id: "number" } },
          ],
        } as never),
      ),
    (error: Error) => {
      assert.match(error.message, /- ops\.no spaces\.name must match/);
      assert.match(error.message, /- ops\.search is used twice/);
      assert.match(error.message, /- ops\.search\.title is missing/);
      assert.match(error.message, /- ops\.search\.description is missing/);
      assert.match(
        error.message,
        /- ops\.read\.schema\.id has no description \(add \.describe\(\)\)/,
      );
      assert.match(error.message, /- ops\.write\.schema must be a zod object/);
      return true;
    },
  );
});

test("validatePlugin refuses an op with no name, and one whose tool name is over 64 characters", () => {
  assert.throws(
    () =>
      validatePlugin(
        definePlugin({ ...notes, ops: [{ ...search, name: "" }] }),
      ),
    /- ops\.0\.name is missing/,
  );
  const long = "a".repeat(60);
  assert.throws(
    () =>
      validatePlugin(
        definePlugin({ ...notes, ops: [{ ...search, name: long }] }),
      ),
    new RegExp(
      `- ops\\.${long}\\.name makes the tool name notes_${long}, over 64 characters`,
    ),
  );
});

test("validatePlugin lists a credential that is not a zod object, and an op with no run", () => {
  assert.throws(
    () =>
      validatePlugin({
        ...notes,
        credential: { url: "x" },
        ops: [{ ...search, run: undefined }],
      } as never),
    (error: Error) => {
      assert.match(error.message, /- credential must be a zod object/);
      assert.match(error.message, /- ops\.search\.run must be a function/);
      return true;
    },
  );
});

test("validatePlugin lists a skill with a bad name, and a name used twice", () => {
  assert.throws(
    () =>
      validatePlugin(
        definePlugin({ ...notes, skills: ["no spaces", "greet", "greet"] }),
      ),
    (error: Error) => {
      assert.match(error.message, /- skills\.no spaces must match/);
      assert.match(error.message, /- skills\.greet is used twice/);
      return true;
    },
  );
});

test("validatePlugin lists a capability with a bad name, no name or one of spaces, a name used twice, and one with no title or description", () => {
  assert.throws(
    () =>
      validatePlugin(
        definePlugin({
          ...notes,
          capabilities: [
            {
              name: "no spaces",
              title: "Spaced",
              description: "Its name has a space.",
            },
            { name: "", title: "Unnamed", description: "It has no name." },
            { name: "   ", title: "Blank", description: "Its name is spaces." },
            {
              name: "write-up",
              title: "Write up a meeting",
              description:
                "A person asks for the notes of a meeting and gets them.",
            },
            { name: "write-up", title: "", description: "" },
          ],
        }),
      ),
    (error: Error) => {
      assert.match(error.message, /- capabilities\.no spaces\.name must match/);
      assert.match(error.message, /- capabilities\.1\.name is missing/);
      assert.match(error.message, /- capabilities\.2\.name is missing/);
      assert.match(error.message, /- capabilities\.write-up is used twice/);
      assert.match(error.message, /- capabilities\.write-up\.title is missing/);
      assert.match(
        error.message,
        /- capabilities\.write-up\.description is missing/,
      );
      return true;
    },
  );
});

test("validatePlugin takes a plugin that keeps the contract", () => {
  validatePlugin(
    definePlugin({
      ...notes,
      ops: [search],
      skills: ["greet"],
      credential: z.object({ url: z.string() }),
      connect: async () => ({}),
    }),
  );
});
