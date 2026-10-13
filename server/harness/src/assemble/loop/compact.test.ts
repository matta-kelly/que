import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AIMessage,
  HumanMessage,
  ToolMessage,
  type AgentMiddleware,
  type BaseMessage,
} from "langchain";
import { assemble } from "../assemble.js";
import { catalog } from "../fixture.js";
import { onDemand } from "../on-demand/index.js";
import { compact } from "./compact.js";
import { keepAll } from "./keep-all.js";
import type { Policy } from "./policy.js";

type Request = { tools: unknown[]; messages: BaseMessage[] };

const using = (loop?: Policy) =>
  assemble(onDemand, { catalog, connect: async () => undefined, loop });

/** The request the model gets, after every middleware in the list has had it. */
async function sent(loop: Policy | undefined, messages: BaseMessage[]) {
  const { tools, middleware } = using(loop);
  let out: Request = { tools: [], messages: [] };
  const model = async (request: Request) => {
    out = request;
    return new AIMessage("");
  };
  const chain = (middleware as AgentMiddleware[]).reduceRight(
    (next, m) => (request: Request) =>
      m.wrapModelCall!(request as never, next as never) as never,
    model as (request: Request) => Promise<AIMessage>,
  );
  await chain({ tools, messages });
  return out;
}

/** One tool call and its result, as the two messages a chat holds for it. */
const call = (
  id: string,
  name: string,
  args: Record<string, unknown>,
  result: string,
): BaseMessage[] => [
  new AIMessage({ content: "", tool_calls: [{ id, name, args }] }),
  new ToolMessage({ tool_call_id: id, name, content: result }),
];

// Large enough that eight of them pass the limit where the clearing starts.
const big = (label: string) => `${label} ${"x".repeat(80_000)}`;

const orders = (count: number, result = big) =>
  Array.from({ length: count }, (_, i) =>
    call(`order-${i}`, "shop_getOrder", { id: i }, result(`order ${i}`)),
  ).flat();

const longChat = () => [
  new HumanMessage("Compare my orders."),
  ...call("open", "open_package", { package: "shop" }, big("opened")),
  ...call(
    "load",
    "load_operation",
    { package: "shop", operation: "getOrder" },
    big("loaded"),
  ),
  ...call("skill", "read_skill", { id: "shop/refunds" }, big("refund steps")),
  ...orders(8),
];

const results = (messages: BaseMessage[], tool: string) =>
  messages
    .filter((m) => ToolMessage.isInstance(m) && m.name === tool)
    .map((m) => String(m.content));

const names = (tools: unknown[]) =>
  tools.map((t) => (t as { name: string }).name);

test("with no policy and with keep-all, the one middleware is the one that picks the tools", () => {
  for (const loop of [undefined, keepAll])
    assert.deepEqual(
      using(loop).middleware.map((m) => m.name),
      ["OperationsInReach"],
    );
});

test("keep-all sends every operation result in a long chat", async () => {
  const { messages } = await sent(keepAll, longChat());
  assert.deepEqual(
    results(messages, "shop_getOrder"),
    orders(8)
      .filter((m) => ToolMessage.isInstance(m))
      .map((m) => String(m.content)),
  );
});

test("compact sends a placeholder for each operation result but the newest three, in a long chat", async () => {
  const { messages } = await sent(compact, longChat());
  const sentResults = results(messages, "shop_getOrder");
  assert.equal(sentResults.length, 8);
  assert.deepEqual(sentResults.slice(0, 5), Array(5).fill("[cleared]"));
  assert.deepEqual(
    sentResults.slice(5),
    [5, 6, 7].map((i) => big(`order ${i}`)),
  );
});

test("compact sends every result in a chat under the limit", async () => {
  const short = [
    new HumanMessage("A few orders."),
    ...orders(5, (label) => label),
  ];
  const { messages } = await sent(compact, short);
  assert.ok(!results(messages, "shop_getOrder").includes("[cleared]"));
});

test("compact keeps the call of a result it does not send, with its arguments", async () => {
  const { messages } = await sent(compact, longChat());
  const calls = messages.flatMap(
    (m) =>
      (m as { tool_calls?: { name: string; args: unknown }[] }).tool_calls ??
      [],
  );
  assert.deepEqual(
    calls.filter((c) => c.name === "shop_getOrder").map((c) => c.args),
    Array.from({ length: 8 }, (_, id) => ({ id })),
  );
});

test("compact never replaces the result of a tool for finding the way around, or of a skill", async () => {
  const { messages } = await sent(compact, longChat());
  assert.deepEqual(results(messages, "open_package"), [big("opened")]);
  assert.deepEqual(results(messages, "load_operation"), [big("loaded")]);
  assert.deepEqual(results(messages, "read_skill"), [big("refund steps")]);
});

test("compact leaves the chat's own messages as they were", async () => {
  const chat = longChat();
  const before = chat.map((m) => m.content);
  const same = [...chat];
  await sent(compact, chat);
  assert.deepEqual(chat, same);
  assert.deepEqual(
    chat.map((m) => m.content),
    before,
  );
});

test("compact sends the same tools as keep-all, for the same chat", async () => {
  const [a, b] = await Promise.all(
    [keepAll, compact].map((loop) => sent(loop, longChat())),
  );
  assert.deepEqual(names(b.tools), names(a.tools));
  assert.ok(names(b.tools).includes("shop_getOrder"));
});
