import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AIMessage,
  HumanMessage,
  ToolMessage,
  type BaseMessage,
} from "langchain";
import { assemble, toolsInReach } from "./assemble.js";
import type { Config } from "./config.js";
import { catalog } from "./fixture.js";
import { onDemand } from "./on-demand/index.js";

// A second config, to show what a config decides and what it does not.
const everything: Config = {
  name: "everything",
  prompt: () => "## Your environment\n\nEvery operation is a tool.",
  tools: () => [],
  send: (_messages, operations) => operations,
};

const user = { name: "Ann User", email: "ann@example.test" };
const using = (config: Config) =>
  assemble(config, { user, catalog, connect: async () => undefined });

const names = (tools: unknown[]) =>
  tools.map((t) => (t as { name: string }).name);

/** The tool names the model is sent for a chat with these messages. */
async function sent(config: Config, messages: BaseMessage[]) {
  const { tools, middleware } = using(config);
  let out: unknown[] = [];
  await middleware[0].wrapModelCall!(
    { tools, messages } as never,
    (async (request: { tools: unknown[] }) => {
      out = request.tools;
      return new AIMessage("");
    }) as never,
  );
  return names(out);
}

const OPERATIONS = ["shop_findOrders", "shop_getOrder"];
const section = (prompt: string, heading: string) =>
  prompt.split(/\n\n(?=## )/).find((s) => s.startsWith(heading));

test("a config decides the environment text", () => {
  const prompt = using(everything).systemPrompt;
  assert.equal(
    section(prompt, "## Your environment"),
    "## Your environment\n\nEvery operation is a tool.",
  );
  assert.notEqual(
    section(using(onDemand).systemPrompt, "## Your environment"),
    section(prompt, "## Your environment"),
  );
});

test("a config decides the tools added for finding the way around", () => {
  assert.deepEqual(names(using(everything).tools), [
    "read_skill",
    ...OPERATIONS,
  ]);
  assert.deepEqual(names(using(onDemand).tools), [
    "open_package",
    "load_operation",
    "read_skill",
    ...OPERATIONS,
  ]);
});

test("a config decides which operations go out with a request", async () => {
  const messages = [new HumanMessage("hi")];
  assert.deepEqual(await sent(everything, messages), [
    "read_skill",
    ...OPERATIONS,
  ]);
  assert.deepEqual(await sent(onDemand, messages), [
    "open_package",
    "load_operation",
    "read_skill",
  ]);
});

test("an operation the config sends goes out beside the base tools", async () => {
  const messages = [
    new AIMessage({
      content: "",
      tool_calls: [
        {
          id: "1",
          name: "load_operation",
          args: { package: "shop", operation: "getOrder" },
        },
      ],
    }),
    new ToolMessage({ tool_call_id: "1", content: "Loaded." }),
  ];
  assert.deepEqual(await sent(onDemand, messages), [
    "open_package",
    "load_operation",
    "read_skill",
    "shop_getOrder",
  ]);
});

test("a config does not decide the role, who the user is, or the package list", () => {
  const [a, b] = [using(everything), using(onDemand)].map((x) =>
    x.systemPrompt.split(/\n\n(?=## )/),
  );
  const shared = (sections: string[]) =>
    sections.filter((s) => !s.startsWith("## Your environment"));
  assert.deepEqual(shared(a), shared(b));
  assert.match(shared(a).join("\n"), /You are a helpful assistant\./);
  assert.match(shared(a).join("\n"), /Ann User/);
  assert.match(shared(a).join("\n"), /User Seven/);
  assert.match(shared(a).join("\n"), /### Shop \(`shop`\)/);
});

test("a config does not decide the operation tools or read_skill", () => {
  const definitions = (config: Config) =>
    using(config)
      .tools.filter((t) => ["read_skill", ...OPERATIONS].includes(t.name))
      .map((t) => [t.name, t.description]);
  assert.deepEqual(definitions(everything), definitions(onDemand));
});

test("with no packages there are no tools, and the prompt says so", () => {
  const { tools, systemPrompt } = assemble(everything, {
    catalog: [],
    connect: async () => undefined,
  });
  assert.deepEqual(tools, []);
  assert.match(systemPrompt, /no packages/i);
  assert.doesNotMatch(systemPrompt, /Every operation is a tool/);
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
