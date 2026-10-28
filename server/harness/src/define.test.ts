import { test } from "node:test";
import assert from "node:assert/strict";
import { defineAgent } from "./agent.ts";
import { readNode } from "./define.ts";
import { defineModel } from "./model.ts";

const chat = {
  name: "chat",
  type: "agent" as const,
  description: "The agent a chat gets.",
  model: "small",
  loop: "long-chat",
};

test("defineAgent gives the agent as its node", () => {
  assert.deepEqual(defineAgent(chat), chat);
});

test("a define function lists every fault of its node in one error, naming it", () => {
  assert.throws(
    () =>
      defineModel({
        name: "small",
        type: "model",
        description: "A small model.",
        id: "small",
        maxTokens: 0,
      }),
    {
      message: [
        "model small is invalid:",
        '- id must be in "provider:model" form, got "small"',
        "- maxTokens must be a whole number above zero, got 0",
      ].join("\n"),
    },
  );
});

test("readNode reads a node by its shape, as another copy of the package makes it, and lists each fault", () => {
  assert.deepEqual(readNode("agent", { ...chat }), { node: chat, faults: [] });
  assert.deepEqual(readNode("agent", { ...chat, model: "" }), {
    faults: ["model Not a lowercase slug."],
  });
});
