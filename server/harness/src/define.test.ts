import { test } from "node:test";
import assert from "node:assert/strict";
import { defineAgent } from "./agent.ts";
import { readNode } from "./define.ts";
import { defineDeployment } from "./deployment.ts";
import { defineLoop } from "./loop.ts";
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

test("each define function marks its node as the definition of its name and type", () => {
  const mark = Symbol.for("@mku1tra/basis/definition");
  const nodes = [
    defineAgent(chat),
    defineLoop({ name: "long-chat", type: "loop", description: "A loop." }),
    defineModel({
      name: "small",
      type: "model",
      description: "A small model.",
      id: "fireworks:small",
      maxTokens: 1000,
    }),
    defineDeployment({
      name: "landl",
      type: "deployment",
      description: "The landl deployment.",
      agents: ["chat"],
      loops: ["long-chat"],
      models: ["small"],
    }),
  ];
  assert.deepEqual(
    nodes.map((node) => Object.getOwnPropertyDescriptor(node, mark)?.value),
    [
      { name: "chat", type: "agent" },
      { name: "long-chat", type: "loop" },
      { name: "small", type: "model" },
      { name: "landl", type: "deployment" },
    ],
  );
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

test("defineModel and readNode take a model that writes its window and price, and one that writes neither: a piece of a model may leave them to another", () => {
  const small = {
    name: "small",
    type: "model" as const,
    description: "A small model.",
    id: "beam:Beam-1.0-501B-A23B",
    maxTokens: 1000,
  };
  const facts = { window: 64_000, price: { input: 1, output: 2 } };
  assert.deepEqual(defineModel({ ...small, ...facts }), { ...small, ...facts });
  assert.deepEqual(readNode("model", { ...small, ...facts }), {
    node: { ...small, ...facts },
    faults: [],
  });
  assert.deepEqual(defineModel(small), small);
  assert.deepEqual(readNode("model", small), { node: small, faults: [] });
});
