import { test } from "node:test";
import assert from "node:assert/strict";
import { AIMessage, HumanMessage, ToolMessage } from "langchain";
import { loadedOperations } from "./send.js";

const load = (id: string, pkg: string, operation: string) =>
  new AIMessage({
    content: "",
    tool_calls: [
      { id, name: "load_operation", args: { package: pkg, operation } },
    ],
  });
const result = (id: string, content: string) =>
  new ToolMessage({ tool_call_id: id, content });

test("a failed load_operation loads nothing", () => {
  const messages = [load("1", "shop", "nope"), result("1", "Error: no such")];
  assert.deepEqual([...loadedOperations(messages)], []);
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
