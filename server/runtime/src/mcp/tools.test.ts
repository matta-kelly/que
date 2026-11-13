/**
 * The tools a deployment gives: each op of each plugin in the user's catalog,
 * named by the op's own name. No database: the catalog is made here from
 * the definitions a mount would give.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import type { Approval, Definition } from "@mku1tra/que-plugin";
import type { Catalog } from "../access/catalog.js";
import type { MountedPlugin } from "../mount/plugins.js";
import { toolsOf } from "./tools.js";

type GivenOp = {
  name: string;
  description: string;
  input: z.ZodObject;
  approval?: Approval;
};

/** A mounted plugin, as mount gives one, with only what the tools read. */
function plugin(name: string, ops: GivenOp[]): MountedPlugin {
  const definition = {
    plugin: {
      name,
      type: "plugin",
      title: name,
      description: `The ${name} plugin.`,
    },
    ops: ops.map(({ name: op, description, input, approval }) => ({
      name: op,
      type: "op",
      title: op,
      description,
      input,
      ...(approval === undefined ? {} : { approval }),
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

/** The last line a flagged op's tool description carries: the model reads it and does not call the op. */
const APPROVAL_LINE =
  "Needs approval, and cannot be approved over MCP: do not call it.";

/** The last line an op whose approval has a `when` carries: some calls run, and the ones that need approval are refused. */
const SOME_LINE =
  "Some calls need approval, which cannot be given over MCP: those calls are refused, and the others run.";

/** The tool names, in the order the tools came. */
const names = (plugins: MountedPlugin[]) =>
  toolsOf(catalog(...plugins)).map((tool) => tool.name);

test("given a catalog whose plugin till holds ops notes and search, when the tools are generated, then their names are notes and search, each with that op's description and input", () => {
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

  assert.deepEqual(names([till]), ["notes", "search"]);

  const tools = toolsOf(catalog(till));
  const notesOp = till.definition.ops.find((op) => op.name === "notes")!;
  const searchOp = till.definition.ops.find((op) => op.name === "search")!;
  const notes = tools.find((tool) => tool.name === "notes")!;
  const search = tools.find((tool) => tool.name === "search")!;
  assert.equal(notes.description, notesOp.description);
  assert.equal(notes.input, notesOp.input);
  assert.equal(notes.placed.plugin.name, "till");
  assert.equal(notes.placed.op.name, "notes");
  assert.equal(search.description, searchOp.description);
  assert.equal(search.input, searchOp.input);
  assert.equal(search.placed.plugin.name, "till");
  assert.equal(search.placed.op.name, "search");
});

test("given a catalog whose plugin holds a flagged op and an unflagged one, when the tools are generated, then the flagged op's tool says destructiveHint and ends its description with the approval line, and the unflagged one's does neither", () => {
  const item = z.object({ item: z.string().describe("The item's name") });
  const till = plugin("till", [
    {
      name: "void",
      description: "Voids an item's sale.",
      input: item,
      approval: true,
    },
    { name: "count", description: "Counts an item.", input: item },
  ]);

  const tools = toolsOf(catalog(till));
  const voided = tools.find((tool) => tool.name === "void")!;
  const counted = tools.find((tool) => tool.name === "count")!;

  assert.equal(
    voided.annotations?.destructiveHint,
    true,
    "the flagged op's tool does not say destructiveHint",
  );
  assert.notEqual(
    counted.annotations?.destructiveHint,
    true,
    "the unflagged op's tool says destructiveHint",
  );
  assert.equal(
    voided.description,
    `Voids an item's sale.\n\n${APPROVAL_LINE}`,
    "the flagged op's tool description does not end with the approval line",
  );
  assert.equal(
    counted.description,
    "Counts an item.",
    "the unflagged op's tool description carries more than the op's own text",
  );
});

test("given a flagged op whose approval has a when, when the tools are generated, then its tool says destructiveHint and ends its description with the line for some calls, not the line that says do not call it", () => {
  const item = z.object({ item: z.string().describe("The item's name") });
  const till = plugin("till", [
    {
      name: "note",
      description: "Notes an item.",
      input: item,
      approval: {
        when: (input: unknown) => (input as { item: string }).item !== "free",
      },
    },
  ]);

  const [noted] = toolsOf(catalog(till));
  assert.equal(noted!.annotations?.destructiveHint, true);
  assert.equal(
    noted!.description,
    `Notes an item.\n\n${SOME_LINE}`,
    "an op that runs for some calls is told not to be called",
  );
});

test("given an op name with a character outside [a-z0-9._-], uppercase too, when the tools are generated, then it throws, naming the plugin and the op", () => {
  for (const op of ["notes/search", "Notes"]) {
    const invalidName = plugin("till", [
      {
        name: op,
        description: "Write a note.",
        input: z.object({ text: z.string().describe("The note's text") }),
      },
    ]);
    assert.throws(
      () => toolsOf(catalog(invalidName)),
      (error: Error) =>
        error.message.includes("till") && error.message.includes(op),
      `no throw names both till and ${op}`,
    );
  }
});

test("given two plugins that each hold an op named notes, when the tools are generated, then it throws, naming the tool and both plugins, and no tool is returned", () => {
  const op = {
    name: "notes",
    description: "Write a note.",
    input: z.object({ text: z.string().describe("The note's text") }),
  };
  assert.throws(
    () => toolsOf(catalog(plugin("till", [op]), plugin("ledger", [op]))),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      for (const word of ["notes", "till", "ledger"])
        assert.ok(
          message.includes(word),
          `the refusal does not name ${word}: ${message}`,
        );
      return true;
    },
  );
});

test("given an op whose name is longer than 64 characters, when the tools are generated, then it throws, naming the op and its length, and one of 64 is a tool", () => {
  const notesInput = z.object({ text: z.string().describe("The note's text") });
  const atLimit = plugin("till", [
    { name: "a".repeat(64), description: "Write a note.", input: notesInput },
  ]);
  const long = "a".repeat(65);
  const overLimit = plugin("till", [
    { name: long, description: "Write a note.", input: notesInput },
  ]);
  assert.deepEqual(names([atLimit]), ["a".repeat(64)]);
  assert.throws(
    () => toolsOf(catalog(overLimit)),
    (error: Error) =>
      error.message.includes(long) && error.message.includes("65"),
  );
});
