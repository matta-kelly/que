import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAgent } from "./agent-spec.js";

test("validateAgent accepts packages, a model and instructions", () => {
  validateAgent({
    packages: ["odoo"],
    model: "fireworks:accounts/fireworks/models/deepseek-v4p1-flash",
    instructions: "You help the sales team.",
  });
});

test("validateAgent accepts a config with no field", () => {
  validateAgent({});
});

test("validateAgent rejects a field that is not in the shape, naming it", () => {
  assert.throws(() => validateAgent({ legibility: "eager" }), /legibility/);
});

test("validateAgent rejects packages that are not a list", () => {
  assert.throws(() => validateAgent({ packages: "odoo" }), /packages/);
});

test("validateAgent rejects a package that is not a name", () => {
  assert.throws(() => validateAgent({ packages: [7] }), /packages/);
});

test("validateAgent rejects an empty model", () => {
  assert.throws(() => validateAgent({ model: "" }), /model/);
});

test("validateAgent rejects empty instructions", () => {
  assert.throws(() => validateAgent({ instructions: "" }), /instructions/);
});

test("validateAgent accepts each loop policy que has", () => {
  validateAgent({ loop: "keep-all" });
  validateAgent({ loop: "compact" });
});

test("validateAgent rejects a loop that is not a policy, naming the ones there are", () => {
  assert.throws(
    () => validateAgent({ loop: "summarize" }),
    (error: Error) => {
      assert.match(error.message, /loop/);
      assert.match(error.message, /keep-all/);
      assert.match(error.message, /compact/);
      return true;
    },
  );
});

test("validateAgent names every fault in one error", () => {
  assert.throws(
    () =>
      validateAgent({
        legibility: "eager",
        packages: "odoo",
        model: "",
        instructions: "",
      }),
    (error: Error) => {
      assert.match(error.message, /legibility/);
      assert.match(error.message, /packages/);
      assert.match(error.message, /model/);
      assert.match(error.message, /instructions/);
      return true;
    },
  );
});
