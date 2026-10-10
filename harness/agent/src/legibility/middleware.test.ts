import { test } from "node:test";
import assert from "node:assert/strict";
import { AIMessage, HumanMessage, ToolMessage } from "langchain";
import { loadedOperations, toolsInReach } from "./middleware.js";

const load = (id: string, pkg: string, operation: string) =>
  new AIMessage({
    content: "",
    tool_calls: [
      { id, name: "load_operation", args: { package: pkg, operation } },
    ],
  });
const result = (id: string, content: string) =>
  new ToolMessage({ tool_call_id: id, content });

test("an operation is loaded once load_operation succeeded for it", () => {
  const messages = [
    new HumanMessage("hi"),
    load("1", "shop", "findOrders"),
    result("1", "Loaded."),
  ];
  assert.deepEqual([...loadedOperations(messages)], ["shop_findOrders"]);
});

test("a failed load_operation loads nothing", () => {
  const messages = [load("1", "shop", "nope"), result("1", "Error: no such")];
  assert.deepEqual([...loadedOperations(messages)], []);
});

test("a load_operation with no result yet loads nothing", () => {
  assert.deepEqual(
    [...loadedOperations([load("1", "shop", "findOrders")])],
    [],
  );
});

test("operations stay loaded for the rest of the chat", () => {
  const messages = [
    load("1", "shop", "findOrders"),
    result("1", "Loaded."),
    new HumanMessage("and another"),
    load("2", "shop", "getOrder"),
    result("2", "Loaded."),
  ];
  assert.deepEqual([...loadedOperations(messages)].sort(), [
    "shop_findOrders",
    "shop_getOrder",
  ]);
});

test("the tools sent are the base tools plus the loaded operations", () => {
  const all = [
    "open_package",
    "load_operation",
    "shop_findOrders",
    "shop_getOrder",
  ].map((name) => ({ name }));
  const sent = toolsInReach(
    all,
    ["open_package", "load_operation"],
    new Set(["shop_getOrder"]),
  );
  assert.deepEqual(
    sent.map((t) => t.name),
    ["open_package", "load_operation", "shop_getOrder"],
  );
});
