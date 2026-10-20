import { test } from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import { definePackage, validatePackage } from "./package-spec.js";

const notes = definePackage({
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

test("validatePackage refuses a package with no definition", () => {
  assert.throws(
    () => validatePackage(undefined),
    /package is invalid:\n- no definition \(default export\)/,
  );
});

test("validatePackage lists a package with a bad name, no title and no description", () => {
  assert.throws(
    () =>
      validatePackage({
        ...notes,
        name: "no spaces",
        title: "",
        description: undefined,
      } as never),
    (error: Error) => {
      assert.match(error.message, /package is invalid/);
      assert.match(error.message, /- name must match/);
      assert.match(error.message, /- title is missing/);
      assert.match(error.message, /- description is missing/);
      return true;
    },
  );
  assert.throws(
    () => validatePackage({ ...notes, name: "" }),
    /package is invalid:\n- name is missing/,
  );
});

test("validatePackage lists ops, skills or capabilities that are not a list, and a connect or whoami that is not a function", () => {
  assert.throws(
    () =>
      validatePackage({
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

test("validatePackage lists an op with a bad name, a name used twice, no title or description, a schema that is not a zod object, and a field with no description", () => {
  assert.throws(
    () =>
      validatePackage(
        definePackage({
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

test("validatePackage refuses an op with no name, and one whose tool name is over 64 characters", () => {
  assert.throws(
    () =>
      validatePackage(
        definePackage({ ...notes, ops: [{ ...search, name: "" }] }),
      ),
    /- ops\.0\.name is missing/,
  );
  const long = "a".repeat(60);
  assert.throws(
    () =>
      validatePackage(
        definePackage({ ...notes, ops: [{ ...search, name: long }] }),
      ),
    new RegExp(
      `- ops\\.${long}\\.name makes the tool name notes_${long}, over 64 characters`,
    ),
  );
});

test("validatePackage lists a credential that is not a zod object, and an op with no run", () => {
  assert.throws(
    () =>
      validatePackage({
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

test("validatePackage lists a skill with a bad name, and a name used twice", () => {
  assert.throws(
    () =>
      validatePackage(
        definePackage({ ...notes, skills: ["no spaces", "greet", "greet"] }),
      ),
    (error: Error) => {
      assert.match(error.message, /- skills\.no spaces must match/);
      assert.match(error.message, /- skills\.greet is used twice/);
      return true;
    },
  );
});

test("validatePackage lists a capability with a bad name, no name or one of spaces, a name used twice, and one with no title or description", () => {
  assert.throws(
    () =>
      validatePackage(
        definePackage({
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

test("validatePackage takes a package that keeps the contract", () => {
  validatePackage(
    definePackage({
      ...notes,
      ops: [search],
      skills: ["greet"],
      credential: z.object({ url: z.string() }),
      connect: async () => ({}),
    }),
  );
});
