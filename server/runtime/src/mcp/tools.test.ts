/**
 * The tools a deployment gives: each op of each plugin in the user's catalog,
 * named `<plugin>.<op>`, lowercased. No database: the catalog is made here from
 * the definitions a mount would give.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import type { Definition } from "@mku1tra/que-plugin";
import type { Catalog } from "../access/catalog.js";
import type { MountedPlugin } from "../mount/plugins.js";
import { toolsOf } from "./tools.js";

type GivenOp = { name: string; description: string; input: z.ZodObject };

/** A mounted plugin, as mount gives one, with only what the tools read. */
function plugin(name: string, ops: GivenOp[]): MountedPlugin {
  const definition = {
    plugin: {
      name,
      type: "plugin",
      title: name,
      description: `The ${name} plugin.`,
    },
    ops: ops.map(({ name: op, description, input }) => ({
      name: op,
      type: "op",
      title: op,
      description,
      input,
      run: async () => ({}),
    })),
    roles: [],
    capabilities: [],
  } as unknown as Definition;
  // The card and skills are mount's; toolsOf reads the definition alone.
  return { definition, skills: [], card: {} } as unknown as MountedPlugin;
}

/** A user's catalog of the plugins given. */
const catalog = (...plugins: MountedPlugin[]): Catalog =>
  plugins.map((plugin) => ({ plugin }));

/** The tool names, in the order the tools came. */
const names = (plugins: MountedPlugin[]) =>
  toolsOf(catalog(...plugins)).map((tool) => tool.name);

test("given a catalog whose plugin till holds ops notes and search, when the tools are generated, then their names are till.notes and till.search, each with that op's description and input", () => {
  const notesInput = z.object({
    text: z.string().describe("The note's text"),
  });
  const searchInput = z.object({
    query: z.string().describe("What to search for"),
  });
  const till = plugin("till", [
    { name: "notes", description: "Write a note.", input: notesInput },
    { name: "search", description: "Search the notes.", input: searchInput },
  ]);

  assert.deepEqual(names([till]), ["till.notes", "till.search"]);

  const tools = toolsOf(catalog(till));
  const notesOp = till.definition.ops.find((op) => op.name === "notes")!;
  const searchOp = till.definition.ops.find((op) => op.name === "search")!;
  const notes = tools.find((tool) => tool.name === "till.notes")!;
  const search = tools.find((tool) => tool.name === "till.search")!;
  assert.equal(notes.description, notesOp.description);
  assert.equal(notes.input, notesOp.input);
  assert.equal(notes.placed.plugin.name, "till");
  assert.equal(notes.placed.op.name, "notes");
  assert.equal(search.description, searchOp.description);
  assert.equal(search.input, searchOp.input);
  assert.equal(search.placed.plugin.name, "till");
  assert.equal(search.placed.op.name, "search");
});

test("given an op named Notes, when the tools are generated, then its tool is till.notes", () => {
  const till = plugin("till", [
    {
      name: "Notes",
      description: "Write a note.",
      input: z.object({ text: z.string().describe("The note's text") }),
    },
  ]);

  assert.deepEqual(names([till]), ["till.notes"]);
});

test("given a plugin or op name with a character outside [a-z0-9._-], when the tools are generated, then it throws, naming the plugin and the op", () => {
  const cases = [
    { plugin: "till/bad", op: "notes" },
    { plugin: "till", op: "notes/search" },
  ];
  for (const { plugin: name, op } of cases) {
    const invalidName = plugin(name, [
      {
        name: op,
        description: "Write a note.",
        input: z.object({ text: z.string().describe("The note's text") }),
      },
    ]);
    assert.throws(
      () => toolsOf(catalog(invalidName)),
      new RegExp(
        `(?=[\\s\\S]*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?=[\\s\\S]*${op.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      ),
      `no throw names both ${name} and ${op}`,
    );
  }
});

test("given plugin Till op notes and plugin till op Notes, when the tools are generated, then it throws, naming both, and no tool is returned", () => {
  const upperPlugin = plugin("Till", [
    {
      name: "notes",
      description: "Write a note.",
      input: z.object({ text: z.string().describe("The note's text") }),
    },
  ]);
  const upperOp = plugin("till", [
    {
      name: "Notes",
      description: "Write a note.",
      input: z.object({ text: z.string().describe("The note's text") }),
    },
  ]);

  assert.throws(
    () => toolsOf(catalog(upperPlugin, upperOp)),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      for (const word of ["Till", "till", "notes", "Notes", "till.notes"])
        assert.ok(
          message.includes(word),
          `the refusal does not name ${word}: ${message}`,
        );
      return true;
    },
  );
});

test("given a plugin and an op whose plugin.op is longer than 64 characters, when the tools are generated, then it throws, naming the name and its length", () => {
  const notesInput = z.object({ text: z.string().describe("The note's text") });
  // The plugin schema caps an op's name at 64, and the MCP name adds the plugin's to it: 64 is the whole name's limit.
  const warehouse = "warehouse";
  const atLimit = plugin(warehouse, [
    {
      name: "a".repeat(64 - warehouse.length - 1),
      description: "Write a note.",
      input: notesInput,
    },
  ]);
  const overLimit = plugin(warehouse, [
    {
      name: "a".repeat(64 - warehouse.length),
      description: "Write a note.",
      input: notesInput,
    },
  ]);
  const long = `${warehouse}.${overLimit.definition.ops[0]!.name}`;
  assert.equal(
    long.length,
    65,
    `the over-long name is ${long.length} characters`,
  );

  const tool = names([atLimit])[0]!;
  assert.equal(
    tool.length,
    64,
    `the tool at the limit is ${tool.length} characters: ${tool}`,
  );

  assert.throws(
    () => toolsOf(catalog(overLimit)),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.ok(
        message.includes(long),
        `the refusal does not name ${long}: ${message}`,
      );
      assert.ok(
        message.includes(String(long.length)),
        `the refusal does not give the name's length ${long.length}: ${message}`,
      );
      return true;
    },
  );
});
