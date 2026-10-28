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
import { definePlugin, OpFailed } from "@mku1tra/que-plugin";
import { resolveLoop } from "@mku1tra/que-harness";
import type { Catalog } from "../../access/catalog.js";
import { assemble } from "../../assemble/assemble.js";
import { eager } from "../../assemble/eager/index.js";
import { build } from "./build.js";

const shop = definePlugin({
  name: "shop",
  type: "plugin",
  title: "Shop",
  description: "The shop's order system.",
  ops: [
    {
      name: "shop-get-order",
      type: "op",
      title: "Get order",
      description: "One order with its lines.",
      input: z.object({ id: z.number().describe("Order id") }),
      run: async (_, { id }) => {
        if (id < 0) throw new OpFailed("no such order");
        return { id };
      },
    },
  ],
});
const catalog: Catalog = [{ plugin: { definition: shop, skills: [] } }];

const failing = { id: -1 };

const asking = (id: string, args: Record<string, unknown>) =>
  new AIMessage({
    content: "",
    tool_calls: [{ id, name: "shop-get-order", args }],
  });

/** A call of a saved chat that failed with no such order, and its result. */
const failedCall = (id: string) => [
  asking(id, failing),
  new ToolMessage({
    content: "Error: no such order",
    tool_call_id: id,
    status: "error",
  }),
];

/** A turn of a saved chat: the user asks, the agent calls get-order, and the call has the result given. */
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
 * One run on a saved chat, in which the model calls get-order with each
 * argument given, then answers. Returns the run's new messages and how many
 * times the model was called.
 */
async function run(
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
    resolveLoop({
      name: "bare",
      type: "loop" as const,
      description: "A loop of a test.",
      result: false,
      summarize: false,
    }),
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

const text = (message: BaseMessage) => String(message.content);

test("after REPEAT_MAX calls with the same tool, arguments and error, the run ends with a message that names the call and the error, and makes no further call", async () => {
  const { results, last, modelCalls } = await run([
    failing,
    failing,
    failing,
    failing,
    failing,
  ]);
  assert.equal(results.length, 3);
  assert.equal(modelCalls, 3);
  assert.ok(AIMessage.isInstance(last));
  assert.match(text(last), /shop-get-order/);
  assert.match(text(last), /\{"id":-1\}/);
  assert.match(text(last), /Error: no such order/);
});

test("a repeat across turns counts: the count comes from the saved chat", async () => {
  const { results, last, modelCalls } = await run(
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

test("a call that failed and then succeeded does not count toward the stop", async () => {
  const { results, last } = await run(
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

test("a call that fails with a new error does not count toward the stop", async () => {
  const { results, last } = await run(
    [failing, failing],
    [
      ...savedTurn("s0", failing, { error: "the shop is down" }),
      ...savedTurn("s1", failing, { error: "the shop is down" }),
    ],
  );
  assert.equal(results.length, 2);
  assert.equal(text(last), "Done.");
});

test("a call with other arguments does not count toward the stop", async () => {
  const { results, last } = await run([failing, failing, { id: -2 }]);
  assert.equal(results.length, 3);
  assert.equal(text(last), "Done.");
});

test("after a run that was stopped, the next turn calls the model", async () => {
  const { last, modelCalls } = await run(
    [],
    [
      new HumanMessage("Get order -1."),
      ...failedCall("s0"),
      ...failedCall("s1"),
      ...failedCall("s2"),
      new AIMessage("I stopped."),
    ],
  );
  assert.equal(modelCalls, 1);
  assert.equal(text(last), "Done.");
});

test("a saved chat that ends in the result that reached REPEAT_MAX calls the model for the user's new message", async () => {
  // A run stopped between the last result and the model's reply.
  const { last, modelCalls } = await run(
    [],
    [
      new HumanMessage("Get order -1."),
      ...failedCall("s0"),
      ...failedCall("s1"),
      ...failedCall("s2"),
    ],
  );
  assert.equal(modelCalls, 1);
  assert.equal(text(last), "Done.");
});

test("the stop message names how many times in a row the call failed, past REPEAT_MAX too", async () => {
  const { last } = await run(
    [failing],
    [
      new HumanMessage("Get order -1."),
      ...failedCall("s0"),
      ...failedCall("s1"),
      ...failedCall("s2"),
      new AIMessage("I stopped."),
    ],
  );
  assert.match(text(last), /failed 4 times in a row/);
});

test("a call whose arguments fail the operation's schema counts as a failed call", async () => {
  const wrong = { id: "a" };
  const { results, last, modelCalls } = await run([
    wrong,
    wrong,
    wrong,
    wrong,
    wrong,
  ]);
  assert.equal(results.length, 3);
  assert.equal(modelCalls, 3);
  assert.match(text(last), /shop-get-order\(\{"id":"a"\}\)/);
});
