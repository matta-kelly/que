import { test } from "node:test";
import assert from "node:assert/strict";
import { AIMessage, HumanMessage, ToolMessage, fakeModel } from "langchain";
import * as z from "zod";
import { definePlugin, OpFailed } from "@mku1tra/que-plugin";
import { resolveLoop } from "@mku1tra/que-harness";
import type { Catalog } from "../../access/catalog.js";
import { build } from "./build.js";
import { assemble } from "../../assemble/assemble.js";
import { eager } from "../../assemble/eager/index.js";
import { onDemand } from "../../assemble/on-demand/index.js";

const shop = definePlugin({
  name: "shop",
  title: "Shop",
  description: "The shop's order system.",
  ops: [
    {
      name: "get-order",
      title: "Get order",
      description: "One order with its lines.",
      schema: z.object({ id: z.number().describe("Order id") }),
      run: async (_, { id }) => {
        if (id < 0) throw new OpFailed("no such order");
        return { id };
      },
    },
  ],
});
const refunds = {
  id: "shop-refunds",
  title: "Refunds",
  description: "How to refund an order.",
  body: "Refund steps.",
};
const catalog: Catalog = [{ plugin: { definition: shop, skills: [refunds] } }];

/** The tool results of one run, in which the model makes each call given, then answers. */
async function results(
  config: typeof eager,
  calls: { name: string; args: Record<string, unknown> }[],
) {
  const model = fakeModel();
  for (const [i, call] of calls.entries())
    model.respond(
      new AIMessage({ content: "", tool_calls: [{ id: `c${i}`, ...call }] }),
    );
  model.respond(new AIMessage("Done."));
  const { tools, systemPrompt, middleware } = assemble(config, {
    catalog,
    connect: async () => undefined,
  });
  const agent = build(
    resolveLoop({ name: "bare", result: false, summarize: false }),
    { model, window: 100_000, systemPrompt, tools, middleware },
  );
  const { messages } = await agent.invoke({
    messages: [new HumanMessage("Get order -1.")],
  });
  return messages.filter((m) => ToolMessage.isInstance(m)) as ToolMessage[];
}

test("a failed operation reaches the model as a failed call, with the text it had", async () => {
  const [failed] = await results(eager, [
    { name: "shop-get-order", args: { id: -1 } },
  ]);
  assert.equal(failed.status, "error");
  assert.equal(failed.content, "Error: no such order");
});

test("an operation that answers is not a failed call", async () => {
  const [answered] = await results(eager, [
    { name: "shop-get-order", args: { id: 4 } },
  ]);
  assert.notEqual(answered.status, "error");
  assert.equal(answered.content, JSON.stringify({ id: 4 }));
});

test("a call whose arguments fail the operation's schema is a failed call, with the schema's text on one line and no stack", async () => {
  const [failed] = await results(eager, [
    { name: "shop-get-order", args: { id: "a" } },
  ]);
  assert.equal(failed.status, "error");
  const content = String(failed.content);
  assert.match(
    content,
    /^Error: Received tool input did not match expected schema .*expected number.*at id$/,
  );
  assert.doesNotMatch(content, /\n/);
  assert.doesNotMatch(content, /node_modules|\bat .*:\d+:\d+/);
});

test("a call to a plugin, an operation or a skill that is not there is a failed call", async () => {
  const failed = await results(onDemand, [
    { name: "open_plugin", args: { plugin: "crm" } },
    { name: "load_operation", args: { plugin: "shop", operation: "nope" } },
    { name: "read_skill", args: { id: "shop-nope" } },
  ]);
  assert.deepEqual(
    failed.map((m) => m.status),
    ["error", "error", "error"],
  );
  assert.match(String(failed[0].content), /^Error: no plugin "crm"/);
  assert.match(String(failed[1].content), /^Error: no operation "nope"/);
  assert.match(String(failed[2].content), /^Error: no skill "shop-nope"/);
});
