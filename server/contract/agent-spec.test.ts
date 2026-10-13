import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAgent } from "./agent-spec.js";

test("validateAgent accepts a name, packages, a model, instructions and a legibility", () => {
  validateAgent({
    name: "chat",
    packages: ["odoo"],
    model: "fireworks:accounts/fireworks/models/deepseek-v4p1-flash",
    instructions: "You help the sales team.",
    legibility: "on-demand",
  });
});

test("validateAgent accepts a config with only a name", () => {
  validateAgent({ name: "chat" });
});

test("validateAgent rejects a field that is not in the shape, naming it", () => {
  assert.throws(() => validateAgent({ name: "chat", tools: [] }), /tools/);
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

test("validateAgent rejects a config with no name, and a name that is not a plain name", () => {
  assert.throws(() => validateAgent({}), /name of the agent is missing/);
  assert.throws(
    () => validateAgent({ name: "two words" }),
    /agent name "two words" must match/,
  );
});

test("validateAgent rejects a legibility que does not have, and lists the ones it has", () => {
  assert.throws(
    () => validateAgent({ name: "chat", legibility: "by-magic" }),
    /legibility of the agent must be one of: on-demand, got "by-magic"/,
  );
});

test("validateAgent names the config in its error", () => {
  assert.throws(
    () => validateAgent({ name: "chat", model: "" }),
    (error: Error) => {
      assert.match(error.message, /^agent chat is invalid/);
      return true;
    },
  );
});
