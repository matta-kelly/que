import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { load } from "./load.js";

const deployment = (name: string) =>
  join(import.meta.dirname, "../fixtures/deployments", name);

test("loads the cases of each package a deployment lists, each with its package, and its agents in order", async () => {
  assert.deepEqual(await load(deployment("shop")), {
    cases: [
      {
        package: "shop",
        name: "find-order-by-customer",
        capability: "find-order",
        input: "Where is the order of Ada?",
        start: "Ada has one open order.",
        good: "The answer gives the state of the order of Ada.",
      },
      {
        package: "shop",
        name: "find-order-not-asked",
        capability: "find-order",
        input: "What can you do?",
        start: "Any.",
        good: "No operation is called.",
      },
    ],
    agents: [
      { name: "chat" },
      { name: "lean" },
      { name: "notes-only", packages: ["notes"] },
    ],
  });
});

test("a package with no cases file gives no case", async () => {
  assert.deepEqual(await load(deployment("no-cases")), {
    cases: [],
    agents: [{ name: "chat" }],
  });
});

test("a deployment that lists no agents gives none", async () => {
  assert.deepEqual((await load(deployment("no-agents"))).agents, []);
});

test("stops, naming the package, on cases that break the contract", async () => {
  await assert.rejects(load(deployment("broken")), (error: Error) => {
    assert.match(error.message, /^eval:/);
    assert.match(error.message, /cases of package broken are invalid/);
    assert.ok(error.cause instanceof Error);
    return true;
  });
});
