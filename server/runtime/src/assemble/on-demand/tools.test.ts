import { test } from "node:test";
import assert from "node:assert/strict";
import { nameIn, OpFailed } from "@mku1tra/que-plugin";
import type { Catalog } from "../../access/catalog.js";
import {
  besideNothing,
  catalog,
  identityOnly,
  mixed,
  skillsOnly,
} from "../fixture.js";
import { skillTools } from "../skills.js";
import { onDemand } from "./index.js";

// What a chat starts with: the config's tools, then the shared read_skill.
const baseTools = (catalog: Catalog) => [
  ...onDemand.tools(catalog),
  ...skillTools(catalog),
];

const call = (name: string, args: Record<string, unknown>) =>
  baseTools(catalog)
    .find((t) => t.name === name)!
    .invoke(args) as Promise<string>;

test("open_plugin lists each operation and skill with one line, and no arguments", async () => {
  const text = await call("open_plugin", { plugin: "shop" });
  assert.match(
    text,
    /find-orders: Find orders\. Search orders by customer name\./,
  );
  assert.match(text, /get-order: Get order\. One order with its lines\./);
  assert.match(text, /shop-refunds: Refunds\. How to refund an order\./);
  assert.doesNotMatch(text, /Returns at most 20/);
  assert.doesNotMatch(text, /Customer name/);
});

test("open_plugin fails, naming the plugins that exist, when asked for one that does not", async () => {
  await assert.rejects(
    () => call("open_plugin", { plugin: "nope" }),
    (error: Error) => error instanceof OpFailed && /shop/.test(error.message),
  );
});

test("load_operation says which tool the operation became", async () => {
  const text = await call("load_operation", {
    plugin: "shop",
    operation: "find-orders",
  });
  assert.ok(text.includes(nameIn("shop", "find-orders")));
});

test("load_operation fails, naming the operations that exist, when asked for one that does not", async () => {
  await assert.rejects(
    () => call("load_operation", { plugin: "shop", operation: "nope" }),
    (error: Error) =>
      error instanceof OpFailed && /find-orders/.test(error.message),
  );
});

test("read_skill returns the skill's text", async () => {
  assert.equal(
    await call("read_skill", { id: "shop-refunds" }),
    "Refund steps.",
  );
});

test("load_operation is left out when no plugin has an operation", () => {
  assert.deepEqual(
    baseTools(skillsOnly).map((t) => t.name),
    ["open_plugin", "read_skill"],
  );
});

test("open_plugin's description for a plugin with operations is word for word what it was", () => {
  assert.equal(
    baseTools(catalog)[0].description,
    "Open Plugin: lists what a plugin holds, its operations and skills, with one line each. Use it to find the operation for a task. It does not make an operation callable; load_operation does.",
  );
});

test("open_plugin's description names no operation when no plugin has one", () => {
  assert.equal(
    baseTools(skillsOnly)[0].description,
    "Open Plugin: lists what a plugin holds, with one line each.",
  );
});

test("there are no base tools when no plugin holds an operation or a skill", () => {
  assert.deepEqual(baseTools(identityOnly), []);
});

test("open_plugin shows no Operations heading for a plugin with no operations, beside one that has them", async () => {
  const text = (await baseTools(mixed)
    .find((t) => t.name === "open_plugin")!
    .invoke({ plugin: "notes" })) as string;
  assert.doesNotMatch(text, /Operations/);
  assert.match(text, /notes-meetings: Meetings\. How to write up a meeting\./);
});

test("every base tool stays when a plugin that holds nothing sits beside one with operations and a skill", () => {
  assert.deepEqual(
    baseTools(besideNothing).map((t) => t.name),
    ["open_plugin", "load_operation", "read_skill"],
  );
});
