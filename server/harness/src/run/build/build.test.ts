import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AIMessage,
  HumanMessage,
  createMiddleware,
  fakeModel,
  tool,
  type AgentMiddleware,
  type BaseMessage,
  type StructuredTool,
} from "langchain";
import * as z from "zod";
import { resolveLoop, type LoopDefinition } from "@que/core";
import { assemble } from "../../assemble/assemble.js";
import { catalog } from "../../assemble/fixture.js";
import { onDemand } from "../../assemble/on-demand/index.js";
import { build } from "./build.js";

const INSTRUCTIONS = "You help the sales team.";

/** A model reply that calls one tool. */
const calling = (id: string, name: string, args: Record<string, unknown>) =>
  new AIMessage({ content: "", tool_calls: [{ id, name, args }] });

const rows = (count: number) =>
  Array.from({ length: count }, (_, i) => `row ${i} of the report`).join("\n");

/** An operation with a result as long as it is asked for. */
const report = tool(async ({ rows: count }) => rows(count), {
  name: "shop_report",
  description: "Report: the rows of the sales report.",
  schema: z.object({ rows: z.number().describe("How many rows") }),
});

/** A window small enough for a test to fill: shares of it are counts a chat can reach. */
const WINDOW = 60_000;

type Run = {
  messages: BaseMessage[];
  files?: Record<string, unknown>;
};

/** One run of the agent build makes, with what the model was sent on each call. */
async function run(
  loop: LoopDefinition,
  replies: BaseMessage[],
  parts: { tools: StructuredTool[]; middleware?: AgentMiddleware[] } = {
    tools: [report],
  },
  window = WINDOW,
) {
  // The summary is asked of the same model: it gets one, and each other call gets the next reply.
  const model = fakeModel();
  let next = 0;
  const reply = (messages: BaseMessage[]) =>
    messages.some((m) => /Context Extraction Assistant/.test(text(m)))
      ? new AIMessage("SUMMARY OF THE OLD PART")
      : (replies[next++] ?? new AIMessage("No reply left."));
  for (let i = 0; i < 20; i++) model.respond(reply);
  const sent: { tools: string[]; system: string; messages: BaseMessage[] }[] =
    [];
  const graph = build(resolveLoop(loop), {
    model,
    window,
    systemPrompt: INSTRUCTIONS,
    tools: parts.tools,
    middleware: [
      ...(parts.middleware ?? []),
      // Last in the list, so it sees a request as the model gets it.
      createMiddleware({
        name: "Seen",
        wrapModelCall: (request, handler) => {
          sent.push({
            tools: request.tools.map((t) =>
              String((t as { name: unknown }).name),
            ),
            system: JSON.stringify(request.systemMessage?.content ?? ""),
            messages: [...request.messages],
          });
          return handler(request);
        },
      }),
    ],
  });
  const result = (await graph.invoke({
    messages: [new HumanMessage("How did we sell?")],
  })) as Run;
  return { result, sent, graph };
}

const middlewareOf = (graph: unknown) =>
  (
    graph as { options: { middleware: { name: string }[] } }
  ).options.middleware.map((m) => m.name);

const resultOf = (messages: BaseMessage[], id: string) =>
  messages.find((m) => (m as { tool_call_id?: string }).tool_call_id === id)!;

const text = (message: BaseMessage) =>
  typeof message.content === "string"
    ? message.content
    : JSON.stringify(message.content);

const everySetting: LoopDefinition = {
  name: "all",
  result: { max: 100 },
  summarize: { at: 0.5, keep: 0.1 },
  args: { max: 10 },
  limits: { modelCalls: 1, toolCalls: 1 },
};

test("with result and summarize off, the agent has the parts it is handed, and the repair as its one middleware", async () => {
  const { result, sent, graph } = await run(
    { ...everySetting, result: false, summarize: false },
    [calling("big", "shop_report", { rows: 200 }), new AIMessage("Well.")],
  );
  assert.deepEqual(middlewareOf(graph), ["patchToolCallsMiddleware", "Seen"]);
  assert.deepEqual(sent[0].tools, ["shop_report"]);
  assert.match(sent[0].system, /You help the sales team\./);
  assert.equal(text(resultOf(result.messages, "big")), rows(200));
  assert.equal(result.files, undefined);
});

test("with result on, an operation that is not loaded does not go out, and read_file does", async () => {
  const connected: string[] = [];
  const { tools, middleware } = assemble(onDemand, {
    catalog,
    connect: async (pkg) => {
      connected.push(pkg.name);
    },
  });
  const { sent, result } = await run(
    { name: "long-chat" },
    [
      calling("load", "load_operation", {
        package: "shop",
        operation: "getOrder",
      }),
      calling("order", "shop_getOrder", { id: 1 }),
      new AIMessage("Order 1."),
    ],
    { tools, middleware },
  );

  const [first, second] = sent.map((request) => request.tools);
  for (const name of [
    "open_package",
    "load_operation",
    "read_skill",
    "read_file",
  ])
    assert.ok(first.includes(name), `${name} goes out with the first request`);
  assert.ok(!first.includes("shop_getOrder"));
  assert.ok(!first.includes("shop_findOrders"));
  assert.ok(second.includes("shop_getOrder"));
  assert.ok(second.includes("read_file"));
  assert.ok(!second.includes("shop_findOrders"));

  assert.deepEqual(connected, ["shop"]);
  assert.equal(text(resultOf(result.messages, "order")), "{}");
});

test("a result over result.max is stored, the chat has its head, its tail and its path, and the model gets read_file and no other tool of files", async () => {
  const { result, sent } = await run(
    { name: "big-results", result: { max: 100 } },
    [calling("big", "shop_report", { rows: 200 }), new AIMessage("Well.")],
  );
  assert.deepEqual(sent[0].tools.sort(), ["read_file", "shop_report"]);
  const inChat = text(resultOf(result.messages, "big"));
  assert.ok(inChat.length < rows(200).length / 2);
  assert.match(inChat, /\/large_tool_results\/big/);
  assert.match(inChat, /row 0 of the report/);
  assert.match(inChat, /row 199 of the report/);
  assert.doesNotMatch(inChat, /row 100 of the report/);
  assert.deepEqual(
    Object.keys(result.files ?? {}).filter((path) =>
      path.startsWith("/large_tool_results/big"),
    ).length,
    1,
  );
});

test("a result under result.max, and any result with result off, is in the chat whole", async () => {
  const under = await run({ name: "big-results", result: { max: 100 } }, [
    calling("small", "shop_report", { rows: 5 }),
    new AIMessage("Well."),
  ]);
  assert.equal(text(resultOf(under.result.messages, "small")), rows(5));

  const off = await run({ name: "whole", result: false }, [
    calling("big", "shop_report", { rows: 5000 }),
    new AIMessage("Well."),
  ]);
  assert.equal(text(resultOf(off.result.messages, "big")), rows(5000));
  assert.deepEqual(Object.keys(off.result.files ?? {}), []);
});

// Each report is about 10,000 tokens: two are under half of the window, three are over.
const REPORT = 1800;
const threeReports = () => [
  calling("a", "shop_report", { rows: REPORT }),
  calling("b", "shop_report", { rows: REPORT }),
  calling("c", "shop_report", { rows: REPORT }),
  new AIMessage("Well."),
];
const kinds = (messages: BaseMessage[]) => messages.map((m) => m.getType());

test("a chat past summarize.at of the window is replaced by a summary and what is kept", async () => {
  const { sent, result } = await run(
    {
      name: "early",
      result: false,
      summarize: { at: 0.5, keep: 0.25 },
    },
    threeReports(),
  );
  // Under half of the window: the chat as it is.
  assert.deepEqual(kinds(sent[2].messages), [
    "human",
    "ai",
    "tool",
    "ai",
    "tool",
  ]);
  assert.equal(text(sent[2].messages[2]), rows(REPORT));

  // Over it: a summary in place of the old part, and the newest report, which a quarter of the window holds.
  const last = sent.at(-1)!.messages;
  assert.match(text(last[0]), /SUMMARY OF THE OLD PART/);
  assert.deepEqual(kinds(last), ["human", "ai", "tool"]);
  assert.equal(text(last[2]), rows(REPORT));
  assert.equal((last[2] as { tool_call_id?: string }).tool_call_id, "c");

  // The thread keeps the summary in place of the old part.
  assert.match(text(result.messages[0]), /SUMMARY OF THE OLD PART/);
  assert.equal(resultOf(result.messages, "a"), undefined);
  assert.equal(text(resultOf(result.messages, "c")), rows(REPORT));
});
