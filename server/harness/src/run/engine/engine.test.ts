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
import { build } from "./index.js";

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

type Run = {
  messages: BaseMessage[];
  files?: Record<string, unknown>;
};

/** One run of the agent an engine builds, with what the model was sent on each call. */
async function run(
  loop: LoopDefinition,
  replies: BaseMessage[],
  parts: { tools: StructuredTool[]; middleware?: AgentMiddleware[] } = {
    tools: [report],
  },
) {
  const model = fakeModel();
  for (const reply of replies) model.respond(reply);
  const sent: { tools: string[]; system: string }[] = [];
  const graph = build(resolveLoop(loop), {
    model,
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

test("plain builds the agent with the parts it is handed, and no other middleware, for a loop with every setting", async () => {
  const { result, sent, graph } = await run(
    { ...everySetting, engine: "plain" },
    [calling("big", "shop_report", { rows: 200 }), new AIMessage("Well.")],
  );
  assert.deepEqual(middlewareOf(graph), ["Seen"]);
  assert.deepEqual(sent[0].tools, ["shop_report"]);
  assert.match(sent[0].system, /You help the sales team\./);
  assert.equal(text(resultOf(result.messages, "big")), rows(200));
  assert.equal(result.files, undefined);
});

test("on plain, no setting adds middleware", async () => {
  for (const loop of [
    { name: "none" },
    everySetting,
    {
      name: "off",
      result: false,
      summarize: false,
      args: false,
      limits: false,
    },
  ] as LoopDefinition[]) {
    const { graph } = await run(loop, [new AIMessage("Well.")]);
    assert.deepEqual(middlewareOf(graph), ["Seen"], loop.name);
  }
});

test("deepagents gives the model que's instructions", async () => {
  const { sent } = await run({ name: "deep", engine: "deepagents" }, [
    new AIMessage("Well."),
  ]);
  assert.match(sent[0].system, /You help the sales team\./);
});

test("on deepagents, an operation that is not loaded does not go out, and the engine's own tools do", async () => {
  const connected: string[] = [];
  const { tools, middleware } = assemble(onDemand, {
    catalog,
    connect: async (pkg) => {
      connected.push(pkg.name);
    },
  });
  const { sent, result } = await run(
    { name: "deep", engine: "deepagents" },
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

test("on deepagents, a result over result.max is stored, and the chat has its head, its tail and its path", async () => {
  const { result } = await run(
    { name: "deep", engine: "deepagents", result: { max: 100 } },
    [calling("big", "shop_report", { rows: 200 }), new AIMessage("Well.")],
  );
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

test("on deepagents, read_file gives the lines asked for of a stored result", async () => {
  const { result } = await run(
    { name: "deep", engine: "deepagents", result: { max: 100 } },
    [
      calling("big", "shop_report", { rows: 200 }),
      calling("page", "read_file", {
        file_path: "/large_tool_results/big.txt",
        offset: 100,
        limit: 3,
      }),
      new AIMessage("Well."),
    ],
  );
  const page = text(resultOf(result.messages, "page"));
  for (const row of [100, 101, 102])
    assert.match(page, new RegExp(`row ${row} of the report`));
  assert.doesNotMatch(page, /row 99 of the report/);
  assert.doesNotMatch(page, /row 103 of the report/);
});

test("on deepagents, a result under result.max, and any result with result off, is in the chat whole", async () => {
  const under = await run(
    { name: "deep", engine: "deepagents", result: { max: 100 } },
    [calling("small", "shop_report", { rows: 5 }), new AIMessage("Well.")],
  );
  assert.equal(text(resultOf(under.result.messages, "small")), rows(5));

  const off = await run({ name: "deep", engine: "deepagents", result: false }, [
    calling("big", "shop_report", { rows: 5000 }),
    new AIMessage("Well."),
  ]);
  assert.equal(text(resultOf(off.result.messages, "big")), rows(5000));
  assert.deepEqual(Object.keys(off.result.files ?? {}), []);
});

test("on deepagents, que's own value for result.max is the one a loop gets when it names none", async () => {
  // 20,000 tokens is about 80,000 characters: one result under it, one over.
  const { result } = await run({ name: "deep", engine: "deepagents" }, [
    calling("under", "shop_report", { rows: 2000 }),
    calling("over", "shop_report", { rows: 6000 }),
    new AIMessage("Well."),
  ]);
  assert.equal(text(resultOf(result.messages, "under")), rows(2000));
  assert.match(
    text(resultOf(result.messages, "over")),
    /\/large_tool_results\/over/,
  );
});

test("on deepagents, summarize, args and limits change nothing in what is built", async () => {
  const built = async (loop: LoopDefinition) =>
    middlewareOf(
      (await run({ ...loop, engine: "deepagents" }, [new AIMessage("Well.")]))
        .graph,
    );
  const plainly = await built({ name: "deep" });
  assert.ok(plainly.includes("SummarizationMiddleware"));
  assert.equal(
    plainly.filter((name) => name === "FilesystemMiddleware").length,
    1,
  );
  assert.deepEqual(
    await built({ name: "deep", summarize: false, args: false, limits: false }),
    plainly,
  );
  assert.deepEqual(
    await built({
      name: "deep",
      summarize: { at: 0.5, keep: 0.1 },
      args: { max: 10 },
      limits: { modelCalls: 1, toolCalls: 1 },
    }),
    plainly,
  );
});
