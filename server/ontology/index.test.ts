import { test } from "node:test";
import assert from "node:assert/strict";
import { plugin } from "@que/plugin";
import * as z from "zod";
import { harness } from "@que/ontology";

type Name = keyof typeof harness.types;

test("@que/ontology gives the schema harness, which imports plugin", () => {
  assert.deepEqual(Object.keys(harness.types), [
    "agent",
    "model",
    "loop",
    "deployment",
  ]);
  assert.deepEqual(harness.imports, [plugin]);
});

/** The node with these fields left out. */
const without = (node: Record<string, unknown>, ...fields: string[]) =>
  Object.fromEntries(
    Object.entries(node).filter(([field]) => !fields.includes(field)),
  );

/** The one issue a parse that fails gives, so a test can say why it failed. */
const issueOf = (type: Name, node: unknown) => {
  try {
    harness.parse(type, node);
  } catch (error) {
    assert.ok(error instanceof z.ZodError);
    assert.equal(error.issues.length, 1);
    return error.issues[0];
  }
  assert.fail(`the ${type} node parsed`);
};

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
  assert.deepEqual(harness.parse("agent", chat), chat);
  assert.deepEqual(harness.parse("model", glmFlash), glmFlash);
  assert.deepEqual(harness.parse("loop", longChat), longChat);
});

test("an agent with no plugins parses, and one with no model or no loop fails, on that link", () => {
  assert.deepEqual(
    harness.parse("agent", without(chat, "plugins")),
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
  assert.deepEqual(harness.parse("deployment", landl), landl);
  for (const link of ["plugins", "agents", "loops", "models"]) {
    assert.deepEqual(issueOf("deployment", without(landl, link))?.path, [link]);
    assert.equal(
      issueOf("deployment", { ...landl, [link]: [] })?.code,
      "too_small",
    );
  }
});
