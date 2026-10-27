import { test } from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import { definePlugin, type PluginDefinition, type Role } from "./contract.ts";
import { validatePlugin } from "./lint.ts";

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

test("validatePlugin lists ops or capabilities that are not a list, and a connect or whoami that is not a function", () => {
  assert.throws(
    () =>
      validatePlugin({
        ...notes,
        ops: undefined,
        capabilities: {},
        connect: "odoo",
        whoami: 1,
      } as never),
    (error: Error) => {
      assert.match(error.message, /- ops must be an array/);
      assert.match(error.message, /- capabilities must be an array/);
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
      assert.match(
        error.message,
        /- ops\.no spaces\.name must be lowercase letters and digits/,
      );
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
      `- plugin\\.json#ops/${long}: notes-${long}, its tool name, is 66 characters: model APIs take at most 64\\. \\(plugin/tool-name\\)`,
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

test("validatePlugin refuses a definition that lists its skills, saying skills are found by folder", () => {
  assert.throws(
    () => validatePlugin({ ...notes, skills: ["greet"] } as never),
    /- "skills" is gone: each folder under skills\/ with a SKILL\.md is a skill/,
  );
});

test("validatePlugin refuses a field the contract does not have", () => {
  assert.throws(
    () => validatePlugin({ ...notes, tools: [] } as never),
    /- has no field "tools"/,
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
      assert.match(
        error.message,
        /- capabilities\.no spaces\.name must be lowercase letters and digits/,
      );
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

const read = { name: "read", description: "Reads the notes." };
const write = { name: "write", description: "Writes the notes." };

test("validatePlugin takes a plugin whose roles are each named by its ops", () => {
  assert.doesNotThrow(() =>
    validatePlugin(
      definePlugin({
        ...notes,
        roles: [read, write],
        ops: [
          { ...search, role: "read" },
          { ...search, name: "save", role: "write" },
        ],
      }),
    ),
  );
});

// Each role fault is reported once: op-role for an op with no role, and basis/link for a role that is not there.
const roleFaults: [
  string,
  Pick<PluginDefinition, "ops"> & { roles?: Role[] },
  string,
][] = [
  [
    "an op with no role when its plugin lists roles",
    { roles: [read], ops: [search] },
    "plugin.json: /ops/0: ops.search names no role: the plugin lists roles (read), so each op names one. (plugin/op-role)",
  ],
  [
    "an op whose role its plugin does not list",
    { roles: [read], ops: [{ ...search, role: "admin" }] },
    "plugin.json#ops/search: /role: It points at notes-admin, which is not a node. (basis/link)",
  ],
  [
    "an op with a role when its plugin lists none",
    { ops: [{ ...search, role: "read" }] },
    "plugin.json#ops/search: /role: It points at notes-read, which is not a node. (basis/link)",
  ],
];
for (const [fault, definition, problem] of roleFaults)
  test(`validatePlugin refuses ${fault}, once`, () => {
    assert.throws(
      () => validatePlugin(definePlugin({ ...notes, ...definition })),
      { message: `plugin notes is invalid:\n- ${problem}` },
    );
  });

test("validatePlugin refuses a role named twice, and one with no description", () => {
  assert.throws(
    () =>
      validatePlugin(
        definePlugin({
          ...notes,
          roles: [read, { name: "read", description: "" }],
        }),
      ),
    (error: Error) => {
      assert.match(error.message, /- roles\.read is used twice/);
      assert.match(error.message, /- roles\.read\.description is missing/);
      return true;
    },
  );
});

test("validatePlugin takes a domain that uses other plugins' ops and skills by name", () => {
  assert.doesNotThrow(() =>
    validatePlugin(
      definePlugin({
        ...notes,
        uses: {
          ops: ["warehouse-get-fabric"],
          skills: ["warehouse-fabric-guide"],
        },
      }),
    ),
  );
});

test("validatePlugin refuses a used op or skill that is not a name in the graph", () => {
  assert.throws(
    () =>
      validatePlugin(
        definePlugin({
          ...notes,
          uses: { ops: ["warehouse_getFabric"], skills: ["warehouse/guide"] },
        }),
      ),
    (error: Error) => {
      assert.match(
        error.message,
        /- uses\.ops\.warehouse_getFabric must be lowercase letters and digits, with single hyphens between them, got "warehouse_getFabric"/,
      );
      assert.match(
        error.message,
        /- uses\.skills\.warehouse\/guide must be lowercase letters and digits, with single hyphens between them, got "warehouse\/guide"/,
      );
      return true;
    },
  );
});

test("validatePlugin refuses a name used twice", () => {
  assert.throws(
    () =>
      validatePlugin(
        definePlugin({
          ...notes,
          uses: { ops: ["warehouse-get-fabric", "warehouse-get-fabric"] },
        }),
      ),
    /- uses\.ops\.warehouse-get-fabric is used twice/,
  );
});

test("validatePlugin refuses a plugin that uses its own op", () => {
  assert.throws(
    () =>
      validatePlugin(
        definePlugin({
          ...notes,
          ops: [search],
          uses: { ops: ["notes-search"] },
        }),
      ),
    /- plugin\.json: \/usesOps: notes-search is its own: a plugin uses only other plugins' ops and skills\. \(plugin\/own-use\)/,
  );
});

test("validatePlugin takes a plugin that keeps the contract", () => {
  validatePlugin(
    definePlugin({
      ...notes,
      ops: [search],
      credential: z.object({ url: z.string() }),
      connect: async () => ({}),
    }),
  );
});

test("validatePlugin refuses an op whose schema has no JSON Schema form, naming the op, as it refuses any fault", () => {
  assert.throws(
    () =>
      validatePlugin(
        definePlugin({
          ...notes,
          ops: [
            {
              ...search,
              schema: z.object({ when: z.date().describe("When") }),
            },
          ],
        }),
      ),
    /^Error: plugin notes is invalid:\n- op notes-search's schema has no JSON Schema form/,
  );
});

test("validatePlugin refuses an op and a role of one name, naming each by its part of the card", () => {
  assert.throws(
    () =>
      validatePlugin(
        definePlugin({
          ...notes,
          roles: [{ name: "search", description: "Searches." }],
          ops: [{ ...search, role: "search" }],
        }),
      ),
    {
      message: [
        "plugin notes is invalid:",
        "- plugin.json#ops/search: The name notes-search is also the name of plugin.json#roles/search. (basis/unique-name)",
        "- plugin.json#roles/search: The name notes-search is also the name of plugin.json#ops/search. (basis/unique-name)",
      ].join("\n"),
    },
  );
});
