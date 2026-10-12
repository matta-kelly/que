import { test } from "node:test";
import assert from "node:assert/strict";
import odoo from "../index.js";
import { CASES } from "./cases.js";

test("the eval cases name only operations odoo has", () => {
  const operations = odoo.ops.map((op) => `odoo_${op.name}`);
  const named = CASES.flatMap((c) => (c.expect.tool ? [c.expect.tool] : []));
  assert.deepEqual(
    named.filter((tool) => !operations.includes(tool)),
    [],
  );
  assert.equal(named.length, 5);
});
