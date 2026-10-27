import { test } from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import { harness, plugin } from "@que/ontology";

type Name = keyof typeof plugin.types | keyof typeof harness.types;

/** A node parsed by the schema that holds its type, as the graph holds it: each link the name it points at. */
const parse = (type: Name, node: unknown): unknown =>
  type in plugin.types
    ? plugin.parse(type as keyof typeof plugin.types, node)
    : harness.parse(type as keyof typeof harness.types, node);

test("@que/ontology gives the schemas plugin and harness, and harness imports plugin", () => {
  assert.deepEqual(Object.keys(plugin.types), [
    "plugin",
    "op",
    "access-role",
    "skill",
    "capability",
    "case",
  ]);
  assert.deepEqual(plugin.imports, []);
  assert.deepEqual(Object.keys(harness.types), [
    "agent",
    "model",
    "loop",
    "deployment",
  ]);
  assert.deepEqual(harness.imports, [plugin]);
});

const warehouse = {
  name: "warehouse",
  type: "plugin",
  description: "The record of what the business has entered.",
  title: "Warehouse",
  ops: ["warehouse-list-fabrics", "warehouse-get-fabric"],
  skills: ["warehouse-fabric-guide"],
  capabilities: ["find-fabric"],
  roles: [],
  uses: [],
  cases: ["count-drafted"],
};

const getFabric = {
  name: "warehouse-get-fabric",
  type: "op",
  description: "Get one fabric by its code.",
  title: "Get a fabric",
  input: { type: "object", properties: { code: { type: "string" } } },
};

const countDrafted = {
  name: "count-drafted",
  type: "case",
  description: "Counts the drafted fabrics, and gives only the number.",
  capability: "find-fabric",
  input: "How many fabrics are still drafted?",
  start: "The warehouse holds fabrics, some drafted.",
  good: "The answer is one number.",
};

/** The node with these fields left out. */
const without = (node: Record<string, unknown>, ...fields: string[]) =>
  Object.fromEntries(
    Object.entries(node).filter(([field]) => !fields.includes(field)),
  );

/** The one issue a parse that fails gives, so a test can say why it failed. */
const issueOf = (type: Name, node: unknown) => {
  try {
    parse(type, node);
  } catch (error) {
    assert.ok(error instanceof z.ZodError);
    assert.equal(error.issues.length, 1);
    return error.issues[0];
  }
  assert.fail(`the ${type} node parsed`);
};

test("a plugin with its ops, skills, capabilities and cases parses, each by its name", () => {
  assert.deepEqual(parse("plugin", warehouse), warehouse);
});

test("an op parses with its title and its input as JSON Schema, and fails with no input", () => {
  assert.deepEqual(parse("op", getFabric), getFabric);
  assert.deepEqual(issueOf("op", without(getFabric, "input"))?.path, ["input"]);
});

test("a case parses with its capability, input, start and good: the case's fields are its type's", () => {
  assert.deepEqual(parse("case", countDrafted), countDrafted);
  for (const field of ["capability", "input", "start", "good"]) {
    const issue = issueOf("case", without(countDrafted, field));
    assert.deepEqual(issue?.path, [field], field);
  }
});

test("a case that names two capabilities fails, on its capability", () => {
  const issue = issueOf("case", {
    ...countDrafted,
    capability: ["find-fabric", "find-company"],
  });
  assert.deepEqual(issue?.path, ["capability"]);
});

/** A node of each type that has a title: plugin, op, skill and capability. */
const titled = [
  warehouse,
  getFabric,
  {
    name: "warehouse-fabric-guide",
    type: "skill",
    description: "How to read a fabric.",
    title: "Fabric guide",
  },
  {
    name: "find-fabric",
    type: "capability",
    description: "List or look up fabrics.",
    title: "Find a fabric",
  },
] as const;

test("a plugin, op, skill or capability with no title, or a blank one, fails on its title, with que's message", () => {
  for (const node of titled) {
    assert.deepEqual(issueOf(node.type as Name, without(node, "title"))?.path, [
      "title",
    ]);
    for (const blank of ["", " "]) {
      const issue = issueOf(node.type as Name, { ...node, title: blank });
      assert.deepEqual(issue?.path, ["title"]);
      assert.equal(issue?.message, "is missing");
    }
  }
});

test("a node with no description fails, on its description", () => {
  const issue = issueOf("plugin", without(warehouse, "description"));
  assert.deepEqual(issue?.path, ["description"]);
});

test("a node with a field not on its type fails, on that field", () => {
  const issue = issueOf("capability", { ...titled[3], heldBy: "landl-db" });
  assert.equal(issue?.code, "unrecognized_keys");
});

const chat = {
  name: "chat",
  type: "agent",
  description: "The agent a chat gets.",
  plugins: ["warehouse"],
  model: "glm-flash",
  loop: "long-chat",
  loading: "on-demand",
};

const glmFlash = {
  name: "glm-flash",
  type: "model",
  description: "A fast model.",
  id: "fireworks:glm-flash",
  maxTokens: 4096,
};

const longChat = {
  name: "long-chat",
  type: "loop",
  description: "A loop for long chats.",
  summarize: { at: 0.8, keep: 0.2 },
  limits: false,
};

test("an agent, a model and a loop parse with the fields their configs write", () => {
  assert.deepEqual(parse("agent", chat), chat);
  assert.deepEqual(parse("model", glmFlash), glmFlash);
  assert.deepEqual(parse("loop", longChat), longChat);
});

test("an agent with no plugins parses, and one with no model or no loop fails, on that link", () => {
  assert.deepEqual(
    parse("agent", without(chat, "plugins")),
    without(chat, "plugins"),
  );
  for (const link of ["model", "loop"])
    assert.deepEqual(issueOf("agent", without(chat, link))?.path, [link]);
});

test("a model whose id is not provider:model, and a loop that keeps more than it summarizes, fail with que's messages", () => {
  const id = issueOf("model", { ...glmFlash, id: "glm-flash" });
  assert.equal(
    id?.message,
    'must be in "provider:model" form, got "glm-flash"',
  );
  const keep = issueOf("loop", {
    ...longChat,
    summarize: { at: 0.5, keep: 0.6 },
  });
  assert.equal(keep?.message, "must be below summarize.at, got 0.6 and 0.5");
});

test("a deployment links its plugins, agents, loops and models, at least one of each", () => {
  const landl = {
    name: "landl",
    type: "deployment",
    description: "The landl deployment.",
    plugins: ["warehouse"],
    agents: ["chat"],
    loops: ["long-chat"],
    models: ["glm-flash"],
  };
  assert.deepEqual(parse("deployment", landl), landl);
  for (const link of ["plugins", "agents", "loops", "models"]) {
    assert.deepEqual(issueOf("deployment", without(landl, link))?.path, [link]);
    assert.equal(
      issueOf("deployment", { ...landl, [link]: [] })?.code,
      "too_small",
    );
  }
});
