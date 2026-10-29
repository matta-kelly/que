import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { lintRoot } from "@mku1tra/basis";
import * as z from "zod";
import { plugin } from "./schema.ts";

type Name = keyof typeof plugin.types;

const warehouse = {
  name: "warehouse",
  type: "plugin",
  description: "The record of what the business has entered.",
  title: "Warehouse",
  ops: ["warehouse-get-fabric"],
  skills: ["warehouse-fabric-guide"],
  capabilities: ["find-fabric"],
  usesOps: [],
};

const getFabric = {
  name: "warehouse-get-fabric",
  type: "op",
  description: "Get one fabric by its code.",
  title: "Get a fabric",
  input: z.object({ code: z.string().describe("The fabric code") }),
  run: async () => ({}),
};

const countDrafted = {
  name: "count-drafted",
  type: "case",
  description: "Counts the drafted fabrics, and gives only the number.",
  capability: "find-fabric",
  input: "How many fabrics are still drafted?",
  start: "The warehouse holds fabrics, some drafted.",
  good: "The answer is one number.",
};

const guide = {
  name: "warehouse-fabric-guide",
  type: "skill",
  description: "How to read a fabric.",
  title: "Fabric guide",
};

const findFabric = {
  name: "find-fabric",
  type: "capability",
  description: "List or look up fabrics.",
  title: "Find a fabric",
};

/** The node with these fields left out. */
const without = (node: Record<string, unknown>, ...fields: string[]) =>
  Object.fromEntries(
    Object.entries(node).filter(([field]) => !fields.includes(field)),
  );

/** The one issue a note's parse gives, so a test can say why it failed. */
const issueOf = (type: Name, node: unknown) => {
  try {
    plugin.parse(type, node);
  } catch (error) {
    assert.ok(error instanceof z.ZodError);
    assert.equal(error.issues.length, 1);
    return error.issues[0];
  }
  assert.fail(`the ${type} node parsed`);
};

test("a plugin, op, skill or capability with no title, or a blank one, fails on its title, with que's message", () => {
  for (const node of [warehouse, getFabric, guide, findFabric]) {
    assert.deepEqual(issueOf(node.type as Name, without(node, "title"))?.path, [
      "title",
    ]);
    for (const blank of ["", " "]) {
      const issue = issueOf(node.type as Name, { ...node, title: blank });
      assert.deepEqual(issue?.path, ["title"]);
      assert.equal(issue?.message, "is missing");
    }
  }
});

test("an op with no input fails, on its input", () => {
  assert.deepEqual(issueOf("op", without(getFabric, "input"))?.path, ["input"]);
});

test("a case that names two capabilities fails, on its capability", () => {
  const issue = issueOf("case", {
    ...countDrafted,
    capability: ["find-fabric", "find-company"],
  });
  assert.deepEqual(issue?.path, ["capability"]);
});

test("a node with a field not on its type fails, on that field", () => {
  const issue = issueOf("capability", { ...findFabric, heldBy: "landl-db" });
  assert.equal(issue?.code, "unrecognized_keys");
});

// The folder of type notes is the plugin schema's own root: its lint runs basis/one-definition over the package's
// exports, as the CLI does.
test("the lint of the plugin schema's root finds no problem: each type note gives only prose, and each zod object the package exports is part of a type or a bridge", async () => {
  const folder = fileURLToPath(plugin.typeNotes!);
  assert.deepEqual((await lintRoot(folder)).problems, []);
});
