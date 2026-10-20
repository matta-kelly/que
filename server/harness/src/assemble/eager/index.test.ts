import { test } from "node:test";
import assert from "node:assert/strict";
import { AIMessage, HumanMessage } from "langchain";
import { assemble } from "../assemble.js";
import { catalog, identityOnly } from "../fixture.js";
import { toolName } from "../operations.js";
import { eager } from "./index.js";

const operations = [
  toolName("shop", "findOrders"),
  toolName("shop", "getOrder"),
];

test("every operation goes out with the first request, and with each one after", () => {
  assert.deepEqual(eager.send([], operations), operations);
  assert.deepEqual(
    eager.send(
      [new HumanMessage("hi"), new AIMessage("hello"), new HumanMessage("and")],
      operations,
    ),
    operations,
  );
});

test("eager adds no tools: read_skill and the operations are all the agent gets", () => {
  const { tools } = assemble(eager, {
    catalog,
    connect: async () => undefined,
  });
  assert.deepEqual(
    tools.map((t) => t.name),
    ["read_skill", ...operations],
  );
});

test("there are no tools when no plugin holds an operation or a skill", () => {
  const { tools } = assemble(eager, {
    catalog: identityOnly,
    connect: async () => undefined,
  });
  assert.deepEqual(tools, []);
});

test("read_skill's description does not send the agent to open_plugin alone", () => {
  const { tools } = assemble(eager, {
    catalog,
    connect: async () => undefined,
  });
  assert.equal(
    tools[0].description,
    "Read Skill: returns the full text of a skill, by its id, as the prompt or open_plugin lists it.",
  );
});
