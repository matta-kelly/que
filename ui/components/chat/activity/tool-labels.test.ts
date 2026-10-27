import { test } from "vitest";
import assert from "node:assert/strict";
import { toolLabel } from "./tool-labels.ts";

test("toolLabel says an op's tool name, its plugin then the op, in words", () => {
  assert.equal(toolLabel("odoo-find-partners", {}), "Odoo find partners");
});

test("toolLabel says a tool of the agent itself by its kind, then what it does", () => {
  assert.equal(toolLabel("read_file", {}), "Read: file");
});

test("toolLabel names what a tool of the agent itself reads, from its arguments", () => {
  assert.equal(
    toolLabel("read_skill", { id: "odoo-lookup-company" }),
    "Read skill: odoo-lookup-company",
  );
  assert.equal(
    toolLabel("open_plugin", { plugin: "odoo" }),
    "Open plugin: odoo",
  );
  assert.equal(
    toolLabel("load_operation", { plugin: "odoo", operation: "find-partners" }),
    "Load operation: odoo find-partners",
  );
});
