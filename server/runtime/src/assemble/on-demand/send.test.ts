import { test } from "node:test";
import assert from "node:assert/strict";
import { AIMessage, HumanMessage, ToolMessage } from "langchain";
import { loadedOperations } from "./send.js";

const load = (id: string, plugin: string, operation: string) =>
  new AIMessage({
    content: "",
    tool_calls: [{ id, name: "load_operation", args: { plugin, operation } }],
  });
const result = (id: string, content: string, status?: "error") =>
  new ToolMessage({ tool_call_id: id, content, status });

test("a failed load_operation loads nothing", () => {
  const messages = [
    load("1", "shop", "nope"),
    result("1", "Error: no such", "error"),
  ];
  assert.deepEqual([...loadedOperations(messages)], []);
});

test("operations stay loaded for the rest of the chat", () => {
  const messages = [
    load("1", "shop", "shop-find-orders"),
    result("1", "Loaded."),
    new HumanMessage("and another"),
    load("2", "shop", "shop-get-order"),
    result("2", "Loaded."),
  ];
  assert.deepEqual([...loadedOperations(messages)].sort(), [
    "shop-find-orders",
    "shop-get-order",
  ]);
});
