import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { lint, lintFolder, type Piece } from "@mku1tra/basis";
import { plugin } from "@mku1tra/que-plugin";
import * as z from "zod";
import * as exported from "./index.ts";

const { harness } = exported;

type Name = keyof typeof harness.types;

test("@mku1tra/que-harness gives the schema harness, which imports plugin", () => {
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

test("a deployment links its agents, loops and models, at least one of each, and its plugins, none or more", () => {
  const landl = {
    name: "landl",
    type: "deployment",
    description: "The landl deployment.",
    agents: ["chat"],
    loops: ["long-chat"],
    models: ["glm-flash"],
  };
  assert.deepEqual(harness.parse("deployment", landl), landl);
  for (const link of ["agents", "loops", "models"])
    assert.equal(
      issueOf("deployment", { ...landl, [link]: [] })?.code,
      "too_small",
    );
});

// The pieces of a deployment named landl, with one agent, chat, one loop and one model, and each node changed by
// `fields`.
const deploymentOf = (
  fields: Record<string, Record<string, unknown>> = {},
): Piece[] =>
  [
    {
      name: "landl",
      type: "deployment",
      description: "The landl deployment.",
      agents: ["chat"],
      loops: ["long-chat"],
      models: ["glm-flash"],
    },
    { ...chat, plugins: [] },
    glmFlash,
    longChat,
  ].map(({ name, ...node }) => ({
    path: `${name}.ts`,
    source: "code",
    name,
    fields: { ...node, ...fields[name] },
  }));

const said = (pieces: Piece[]) =>
  lint(harness, pieces).problems.map(({ path, rule, field, message }) => [
    path,
    rule,
    field,
    message,
  ]);

test("a deployment whose agent runs on its model and in its loop has no problem", () => {
  assert.deepEqual(said(deploymentOf()), []);
});

test("an agent's link to a plugin, model or loop that is no node says where the deployment would give it", () => {
  assert.deepEqual(
    said(
      deploymentOf({
        chat: { plugins: ["delta"], model: "big", loop: "short-run" },
      }),
    ),
    [
      [
        "chat.ts",
        "basis/link",
        "/plugins",
        "names the plugin delta, which the deployment does not mount",
      ],
      [
        "chat.ts",
        "basis/link",
        "/model",
        "names the model big, which no file in the deployment's models/ gives",
      ],
      [
        "chat.ts",
        "basis/link",
        "/loop",
        "names the loop short-run, which no file in the deployment's loops/ gives",
      ],
    ],
  );
});

test("an agent the deployment names, on a model the deployment does not name, fails harness/named", () => {
  const big = { ...glmFlash, name: "big" };
  assert.deepEqual(
    said([
      ...deploymentOf({ chat: { model: "big" } }),
      {
        path: "big.ts",
        source: "code",
        name: "big",
        fields: without(big, "name"),
      },
    ]),
    [
      [
        "landl.ts",
        "harness/named",
        "/agents/0",
        "the agent chat names the model big, which the deployment does not name. Models: glm-flash",
      ],
    ],
  );
});

test("an agent the deployment names, in a loop the deployment does not name, fails harness/named", () => {
  const shortRun = { ...longChat, name: "short-run" };
  assert.deepEqual(
    said([
      ...deploymentOf({ chat: { loop: "short-run" } }),
      {
        path: "short-run.ts",
        source: "code",
        name: "short-run",
        fields: without(shortRun, "name"),
      },
    ]),
    [
      [
        "landl.ts",
        "harness/named",
        "/agents/0",
        "the agent chat names the loop short-run, which the deployment does not name. Loops: long-chat",
      ],
    ],
  );
});

test("an agent the deployment names, with a plugin the deployment does not name, fails harness/named", () => {
  const warehouse = {
    name: "warehouse",
    type: "plugin",
    description: "The record.",
    title: "Warehouse",
  };
  assert.deepEqual(
    said([
      ...deploymentOf({ chat: { plugins: ["warehouse"] } }),
      {
        path: "warehouse.ts",
        source: "code",
        name: "warehouse",
        fields: without(warehouse, "name"),
      },
    ]),
    [
      [
        "landl.ts",
        "harness/named",
        "/agents/0",
        "the agent chat names plugins the deployment does not name: warehouse",
      ],
    ],
  );
});

test("a model whose maxTokens is above its window fails harness/max-tokens-in-window", () => {
  assert.deepEqual(
    said(deploymentOf({ "glm-flash": { window: 1000 } })).map(
      ([path, rule]) => [path, rule],
    ),
    [["glm-flash.ts", "harness/max-tokens-in-window"]],
  );
});

// A folder's lint runs basis/one-definition over the package's exports, as the CLI does: the in-memory lint calls no code.
test("the lint of the harness schema's folder finds no problem: each type note gives only prose, and each zod object the package exports is part of a type", async () => {
  const folder = fileURLToPath(harness.typeNotes!);
  assert.deepEqual((await lintFolder(harness, folder)).problems, []);
});
