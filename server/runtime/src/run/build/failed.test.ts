import { test } from "node:test";
import assert from "node:assert/strict";
import { AIMessage, HumanMessage, ToolMessage, fakeModel } from "langchain";
import fc from "fast-check";
import * as z from "zod";
import { definePlugin, OpFailed } from "@mku1tra/que-plugin";
import { resolveLoop } from "@mku1tra/que-harness";
import type { Catalog } from "../../access/catalog.js";
import { build } from "./build.js";
import { assemble } from "../../assemble/assemble.js";
import { door } from "../../assemble/door.js";
import { eager } from "../../assemble/eager/index.js";
import { onDemand } from "../../assemble/on-demand/index.js";

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
    {
      name: "shop-tag-orders",
      type: "op",
      title: "Tag orders",
      description: "Tags the orders named.",
      input: z.object({
        ids: z
          .string()
          .refine((s) => !s.includes(" "), "ids has no spaces")
          .transform((s) => s.split(","))
          .describe("Order ids, comma-separated"),
        // A transform that throws on text that is no JSON.
        meta: z
          .string()
          .transform((s): unknown => JSON.parse(s))
          .optional()
          .describe("Order metadata, as JSON"),
      }),
      run: async (_, { ids }) => ({ tagged: ids }),
    },
  ],
});
const refunds = {
  name: "shop-refunds",
  type: "skill" as const,
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
    // The door, on access that gives no connection, called as one user.
    call: (op, params) => door(async () => undefined)(op, params, "ana"),
  });
  const agent = build(
    resolveLoop({
      name: "bare",
      type: "loop" as const,
      description: "A loop of a test.",
      result: false,
      summarize: false,
    }),
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

test("a call whose arguments fail the operation's schema is a failed call, on one line with no stack, naming the field and the type it expected", async () => {
  const [failed] = await results(eager, [
    { name: "shop-get-order", args: { id: "a" } },
  ]);
  assert.equal(failed.status, "error");
  const content = String(failed.content);
  assert.match(content, /^Error: /);
  assert.match(content, /\bid\b/);
  assert.match(content, /\bnumber\b/);
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

test("a call whose arguments break a refine is a failed call, on one line, with the path and the refine's message", async () => {
  // A run that stops gives its error, so the stop shows in the assertion.
  const outcome = await results(eager, [
    { name: "shop-tag-orders", args: { ids: "a b" } },
    { name: "shop-tag-orders", args: { ids: " a" } },
  ]).catch((error: unknown) => error);
  assert.ok(Array.isArray(outcome), `the run stopped on ${String(outcome)}`);
  const [spaced, leading] = outcome;
  assert.equal(spaced.status, "error");
  assert.match(String(spaced.content), /^Error: .*\bids\b.*ids has no spaces/);
  assert.doesNotMatch(String(spaced.content), /\n/);
  assert.equal(leading.status, "error");
  assert.match(String(leading.content), /^Error: .*\bids\b.*ids has no spaces/);
  assert.doesNotMatch(String(leading.content), /\n/);
});

// Arguments a model can send: right ones, ones that break the refine or the type, and extra fields.
const commaIds = fc.string({ unit: fc.constantFrom("a", "b", ",", " ") });
const modelArguments = fc.oneof(
  fc.record({ ids: commaIds }),
  fc.record({ ids: commaIds, extra: fc.jsonValue() }),
  fc.record({ ids: commaIds, meta: fc.string() }),
  fc.record({ ids: commaIds, meta: fc.json() }),
  fc.record({ ids: fc.jsonValue() }),
  fc.dictionary(fc.string(), fc.jsonValue()),
);

test("given any arguments, when the model calls an op whose input has a refine and a transform, then the call answers or is a failed call, and the run never stops on it", async () => {
  await fc.assert(
    fc.asyncProperty(modelArguments, async (args) => {
      const outcome = await results(eager, [
        { name: "shop-tag-orders", args },
      ]).catch((error: unknown) => error);
      assert.ok(
        Array.isArray(outcome),
        `the run stopped on ${String(outcome)}`,
      );
      const [message] = outcome;
      if (message.status !== "error")
        assert.match(String(message.content), /^\{"tagged":\[.*\]\}$/);
    }),
    { numRuns: 50 },
  );
});

test("a call whose transform throws is a failed call with the throw's message, and the run goes on", async () => {
  // A run that stops gives its error, so the stop shows in the assertion.
  const outcome = await results(eager, [
    { name: "shop-tag-orders", args: { ids: "a", meta: "{" } },
    { name: "shop-tag-orders", args: { ids: "a,b" } },
  ]).catch((error: unknown) => error);
  assert.ok(Array.isArray(outcome), `the run stopped on ${String(outcome)}`);
  const [failed, answered] = outcome;
  assert.equal(failed.status, "error");
  assert.match(String(failed.content), /^Error: /);
  assert.ok(
    String(failed.content).includes(
      "Expected property name or '}' in JSON at position 1",
    ),
    String(failed.content),
  );
  assert.notEqual(answered.status, "error");
  assert.equal(answered.content, JSON.stringify({ tagged: ["a", "b"] }));
});
