import { test } from "vitest";
import assert from "node:assert/strict";
import { toolLabel } from "./tool-labels.ts";

test("toolLabel names the package, then the operation in words", () => {
  assert.equal(toolLabel("odoo_findPartners", {}), "Odoo: find partners");
});

test("toolLabel names what a tool of the agent itself reads, from its arguments", () => {
  assert.equal(
    toolLabel("read_skill", { id: "odoo/lookup-company" }),
    "Read skill: odoo/lookup-company",
  );
  assert.equal(
    toolLabel("open_package", { package: "odoo" }),
    "Open package: odoo",
  );
  assert.equal(
    toolLabel("load_operation", { package: "odoo", operation: "findPartners" }),
    "Load operation: odoo findPartners",
  );
});
