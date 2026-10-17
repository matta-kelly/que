import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AIMessage,
  HumanMessage,
  ToolMessage,
  createMiddleware,
  fakeModel,
  type BaseMessage,
} from "langchain";
import * as z from "zod";
import {
  definePackage,
  OperationFailed,
  resolveLoop,
  type LoopDefinition,
} from "@que/core";
import type { Catalog } from "../../access/catalog.js";
import { assemble } from "../../assemble/assemble.js";
import { eager } from "../../assemble/eager/index.js";
import { build } from "./build.js";

const shop = definePackage({
  name: "shop",
  title: "Shop",
  description: "The shop's order system.",
  ops: [
    {
      name: "getOrder",
      title: "Get order",
      description: "One order with its lines.",
      schema: z.object({ id: z.number().describe("Order id") }),
      run: async (_, { id }) => {
        if (id < 0) throw new OperationFailed("no such order");
        return { id };
      },
    },
  ],
});
const catalog: Catalog = [{ pkg: { definition: shop, skills: [] } }];

const asking = (id: string, args: Record<string, unknown>) =>
  new AIMessage({
    content: "",
    tool_calls: [{ id, name: "shop_getOrder", args }],
  });

/** A turn of a saved chat: the user asks, the agent calls getOrder, and the call has the result given. */
const savedTurn = (
  id: string,
  args: Record<string, unknown>,
  result: { error: string } | { answer: string },
) => [
  new HumanMessage("Get the order."),
  asking(id, args),
  "error" in result
    ? new ToolMessage({
        content: `Error: ${result.error}`,
        tool_call_id: id,
        status: "error",
      })
    : new ToolMessage({ content: result.answer, tool_call_id: id }),
  new AIMessage("That did not work."),
];

/**
 * One run on a saved chat, in which the model calls getOrder with each
 * argument given, then answers. Returns the run's new messages and how many
 * times the model was called.
 */
async function run(
  loop: LoopDefinition,
  calls: Record<string, unknown>[],
  saved: BaseMessage[] = [],
) {
  const model = fakeModel();
  for (const [i, args] of calls.entries()) model.respond(asking(`c${i}`, args));
  model.respond(new AIMessage("Done."));
  let modelCalls = 0;
  const { tools, systemPrompt, middleware } = assemble(eager, {
    catalog,
    connect: async () => undefined,
  });
  const agent = build(
    resolveLoop({ result: false, summarize: false, ...loop }),
    {
      model,
      window: 100_000,
      systemPrompt,
      tools,
      middleware: [
        ...middleware,
        createMiddleware({
          name: "Counted",
          wrapModelCall: (request, handler) => {
            modelCalls++;
            return handler(request);
          },
        }),
      ],
    },
  );
  const chat = [...saved, new HumanMessage("Get order -1.")];
  const { messages } = await agent.invoke({ messages: chat });
  const added = messages.slice(chat.length);
  return {
    results: added.filter((m) => ToolMessage.isInstance(m)),
    last: added.at(-1)!,
    modelCalls,
  };
}

const failing = { id: -1 };
const text = (message: BaseMessage) => String(message.content);

test("after max calls with the same tool, arguments and error, the run ends with a message that names the call and the error, and makes no further call", async () => {
  const { results, last, modelCalls } = await run(
    { name: "guarded", repeat: { max: 3 } },
    [failing, failing, failing, failing, failing],
  );
  assert.equal(results.length, 3);
  assert.equal(modelCalls, 3);
  assert.ok(AIMessage.isInstance(last));
  assert.match(text(last), /shop_getOrder/);
  assert.match(text(last), /\{"id":-1\}/);
  assert.match(text(last), /Error: no such order/);
});

test("a repeat across turns counts: the count comes from the saved chat", async () => {
  const { results, last, modelCalls } = await run(
    { name: "guarded", repeat: { max: 3 } },
    [failing, failing, failing],
    [
      ...savedTurn("s0", failing, { error: "no such order" }),
      ...savedTurn("s1", failing, { error: "no such order" }),
    ],
  );
  assert.equal(results.length, 1);
  assert.equal(modelCalls, 1);
  assert.match(text(last), /Error: no such order/);
});

test("a call that failed and then succeeded does not count toward max", async () => {
  const { results, last } = await run(
    { name: "guarded", repeat: { max: 3 } },
    [failing, failing],
    [
      ...savedTurn("s0", failing, { error: "no such order" }),
      ...savedTurn("s1", failing, { error: "no such order" }),
      ...savedTurn("s2", failing, { answer: '{"id":-1}' }),
    ],
  );
  assert.equal(results.length, 2);
  assert.equal(text(last), "Done.");
});

test("a call that fails with a new error does not count toward max", async () => {
  const { results, last } = await run(
    { name: "guarded", repeat: { max: 3 } },
    [failing, failing],
    [
      ...savedTurn("s0", failing, { error: "the shop is down" }),
      ...savedTurn("s1", failing, { error: "the shop is down" }),
    ],
  );
  assert.equal(results.length, 2);
  assert.equal(text(last), "Done.");
});

test("a call with other arguments does not count toward max", async () => {
  const { results, last } = await run({ name: "guarded", repeat: { max: 2 } }, [
    failing,
    { id: -2 },
  ]);
  assert.equal(results.length, 2);
  assert.equal(text(last), "Done.");
});

test("with repeat false, the same failing call goes on until the model stops", async () => {
  const { results, last } = await run({ name: "unguarded", repeat: false }, [
    failing,
    failing,
    failing,
    failing,
    failing,
  ]);
  assert.equal(results.length, 5);
  assert.equal(text(last), "Done.");
});

test("after a run that was stopped, the next turn calls the model", async () => {
  const { last, modelCalls } = await run(
    { name: "guarded", repeat: { max: 2 } },
    [],
    [
      new HumanMessage("Get order -1."),
      asking("s0", failing),
      new ToolMessage({
        content: "Error: no such order",
        tool_call_id: "s0",
        status: "error",
      }),
      asking("s1", failing),
      new ToolMessage({
        content: "Error: no such order",
        tool_call_id: "s1",
        status: "error",
      }),
      new AIMessage("I stopped."),
    ],
  );
  assert.equal(modelCalls, 1);
  assert.equal(text(last), "Done.");
});
