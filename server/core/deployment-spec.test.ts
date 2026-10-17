import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDeployment } from "./deployment-spec.js";

test("validateDeployment names every problem in one error", () => {
  assert.throws(
    () => validateDeployment({ name: "two words", packages: [""] }),
    (error: Error) => {
      assert.match(error.message, /name/);
      assert.match(error.message, /packages/);
      return true;
    },
  );
});

test("validateDeployment says so when there is no definition", () => {
  assert.throws(() => validateDeployment(undefined), /no definition/);
});

test("validateDeployment rejects agents that are not a list, and an agent that is not a file path", () => {
  assert.throws(
    () =>
      validateDeployment({ name: "shop", packages: [], agents: "./chat.ts" }),
    /agents of deployment shop must be an array/,
  );
  assert.throws(
    () => validateDeployment({ name: "shop", packages: [], agents: [7, " "] }),
    (error: Error) => {
      assert.match(error.message, /must each be a file path, got 7/);
      assert.match(error.message, /must each be a file path, got " "/);
      return true;
    },
  );
});

test("validateDeployment rejects an agent block, and says a config is now a file", () => {
  assert.throws(
    () =>
      validateDeployment({
        name: "shop",
        packages: [],
        agent: { model: "provider:model" },
      }),
    /deployment shop has an `agent` block: an agent config is a file of its own, listed in `agents`/,
  );
});

test("validateDeployment rejects a deployment that lists no agent, no loop or no model, left out or empty", () => {
  const full = {
    name: "shop",
    packages: [],
    agents: ["./chat.ts"],
    loops: ["./long-chat.ts"],
    models: ["./small.ts"],
  };
  for (const [list, one] of [
    ["agents", "agent"],
    ["loops", "loop"],
    ["models", "model"],
  ])
    for (const none of [undefined, []])
      assert.throws(
        () => validateDeployment({ ...full, [list]: none }),
        new RegExp(
          `deployment shop lists no ${one}: list at least one ${one} config in \`${list}\``,
        ),
        `${list}: ${JSON.stringify(none)}`,
      );
  validateDeployment(full);
});
