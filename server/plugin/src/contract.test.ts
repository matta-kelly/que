import { test } from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import * as zm from "zod/mini";
import { definePlugin, readDefinition } from "./contract.ts";

const notes = {
  name: "notes",
  type: "plugin" as const,
  title: "Notes",
  description: "How the team writes things down.",
};

const search = {
  name: "notes-search",
  type: "op" as const,
  title: "Search notes",
  description: "Find notes by a word.",
  input: z.object({ word: z.string().describe("The word to find") }),
  run: async () => [],
};

const read = {
  name: "notes-read",
  type: "access-role" as const,
  description: "Reads the notes.",
};

const findNote = {
  name: "find-note",
  type: "capability" as const,
  title: "Find a note",
  description: "A person asks for a note and gets it.",
};

test("definePlugin gives the plugin node, listing what it holds by name, and each node it holds as given", () => {
  const definition = definePlugin({
    ...notes,
    roles: [read],
    ops: [{ ...search, role: "notes-read" }],
    capabilities: [findNote],
  });
  assert.deepEqual(definition.plugin, {
    ...notes,
    ops: ["notes-search"],
    roles: ["notes-read"],
    capabilities: ["find-note"],
  });
  assert.equal(definition.ops[0].run, search.run);
  assert.equal(definition.ops[0].input, search.input);
  assert.deepEqual(definition.roles, [read]);
  assert.deepEqual(definition.capabilities, [findNote]);
});

test("definePlugin keeps a plugin's credential, connect and whoami as given", () => {
  const credential = z.object({ url: z.string() });
  const connect = async () => ({});
  const whoami = async () => ({ id: 1, name: "Ada" });
  const { plugin } = definePlugin({ ...notes, credential, connect, whoami });
  assert.equal(plugin.credential, credential);
  assert.equal(plugin.connect, connect);
  assert.equal(plugin.whoami, whoami);
});

test("definePlugin lists every fault of the plugin and of each node it holds, each after its place", () => {
  assert.throws(
    () =>
      definePlugin({
        ...notes,
        description: "",
        ops: [{ ...search, title: "" }],
        roles: [{ ...read, description: "" }],
      }),
    {
      message: [
        "plugin notes is invalid:",
        "- description Too small: expected string to have >=1 characters",
        "- ops.notes-search title is missing",
        "- roles.notes-read description Too small: expected string to have >=1 characters",
      ].join("\n"),
    },
  );
});

test("definePlugin refuses a list of what it holds that is not a list", () => {
  assert.throws(
    () => definePlugin({ ...notes, ops: {} as never }),
    /- ops must be an array/,
  );
});

test("definePlugin refuses an op input that is not a zod object", () => {
  assert.throws(
    () => definePlugin({ ...notes, ops: [{ ...search, input: {} as never }] }),
    /- ops\.notes-search input must be a zod object/,
  );
});

test("definePlugin refuses an op input with a field that has no description", () => {
  assert.throws(
    () =>
      definePlugin({
        ...notes,
        ops: [{ ...search, input: z.object({ word: z.string() }) }],
      }),
    /- ops\.notes-search input\.word has no description \(add \.describe\(\)\)/,
  );
});

test("definePlugin refuses an op input that a model API cannot take as JSON Schema", () => {
  assert.throws(
    () =>
      definePlugin({
        ...notes,
        ops: [
          { ...search, input: z.object({ when: z.date().describe("When") }) },
        ],
      }),
    /- ops\.notes-search input has no JSON Schema form/,
  );
});

test("definePlugin refuses a credential that is not a zod object, and a connect that is not a function", () => {
  assert.throws(
    () =>
      definePlugin({
        ...notes,
        credential: {} as never,
        connect: "connect" as never,
      }),
    (error: Error) => {
      assert.match(error.message, /- credential must be a zod object/);
      assert.match(error.message, /- connect must be a function/);
      return true;
    },
  );
});

test("readDefinition reads a definition by its shape, as another copy of the package makes it", () => {
  const definition = definePlugin({ ...notes, ops: [search] });
  const copy = {
    plugin: { ...definition.plugin },
    ops: [{ ...definition.ops[0] }],
    roles: [],
    capabilities: [],
  };
  assert.deepEqual(readDefinition(copy), { definition, faults: [] });
});

test("readDefinition lists each fault of a value that is not a definition, after its place", () => {
  assert.deepEqual(readDefinition("notes"), {
    faults: ["it is not what definePlugin gives"],
  });
  assert.deepEqual(
    readDefinition({
      plugin: { ...notes, ops: [], roles: [], capabilities: [] },
      ops: [{ ...search, title: "" }],
      roles: {},
      capabilities: [],
    }),
    {
      faults: ["ops.notes-search title is missing", "roles must be an array"],
    },
  );
});

test("readDefinition gives a fault when the plugin node's list of what it holds is not the nodes it holds", () => {
  const definition = definePlugin({ ...notes, ops: [search] });
  assert.deepEqual(
    readDefinition({
      ...definition,
      plugin: { ...definition.plugin, ops: [] },
    }),
    {
      faults: ["plugin.ops names none, and the definition holds notes-search"],
    },
  );
});

test("definePlugin takes an op input of zod/mini, its fields described in zod's registry", () => {
  const input = zm.object({
    word: zm.string().register(zm.globalRegistry, {
      description: "The word to find",
    }),
  });
  assert.equal(
    definePlugin({ ...notes, ops: [{ ...search, input: input as never }] })
      .ops[0].input,
    input,
  );
});
