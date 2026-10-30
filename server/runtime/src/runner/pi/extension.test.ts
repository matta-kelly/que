/**
 * que's catalog as a pi Extension, and its tool calls in the AG-UI stream. Each run is on a Harness of its own, on
 * pi's memory storage, with the extension of one user's catalog selected; pi-ai's scripted provider (`faux`) makes
 * the model's calls, so no model is called. Each op's tool runs through the door, which a spy records.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type { Message, Tool } from "@earendil-works/pi-ai";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { validateToolArguments } from "@earendil-works/pi-ai/utils/validation";
import {
  createRegistry,
  Harness,
  MemoryStorage,
  ToolResultEntry,
  watchEvents,
} from "@earendil-works/pi-durable";
import { EventType, type AGUIEvent } from "@ag-ui/core";
import fc from "fast-check";
import * as z from "zod";
import { cardOf, definePlugin, OpFailed } from "@mku1tra/que-plugin";
import type { Catalog } from "../../access/catalog.js";
import { door, type Call } from "../../assemble/door.js";
import { aguiRun } from "./agui.js";
import { extension } from "./extension.js";

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
        if (id === -1) throw new OpFailed("no such order");
        if (id === -2) throw new OpFailed("the shop is closed");
        return { id };
      },
    },
    {
      name: "shop-list-orders",
      type: "op",
      title: "List orders",
      description: "The newest orders.",
      input: z.object({
        customer: z.string().describe("Customer name"),
        limit: z.number().default(10).describe("How many orders"),
      }),
      run: async (_, params) => params,
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
const skill = (name: string, title: string, body: string) => ({
  name,
  type: "skill" as const,
  title,
  description: `How to ${title.toLowerCase()} an order.`,
  body,
});
const catalog: Catalog = [
  {
    plugin: {
      definition: shop,
      skills: [
        skill("shop-refunds", "Refund", "Refund steps."),
        skill("shop-returns", "Return", "Return steps."),
      ],
    },
  },
];

const crm = definePlugin({
  name: "crm",
  type: "plugin",
  title: "CRM",
  description: "The customer records.",
  ops: [
    {
      name: "crm-find-contact",
      type: "op",
      title: "Find contact",
      description: "A contact by email.",
      input: z.object({
        email: z.string().describe("Email address"),
        active: z.boolean().optional().describe("Only active contacts"),
      }),
      run: async (_, { email }) => ({ email }),
    },
  ],
});
const crmOnly: Catalog = [{ plugin: { definition: crm, skills: [] } }];

/** Each call that reaches the door: the op's plugin and name, the params it got, and the user. */
let doorCalls: { plugin: string; op: string; params: unknown; user: string }[] =
  [];
const theDoor = door(async () => undefined);
const call: Call = (placed, params, user) => {
  doorCalls.push({
    plugin: placed.plugin.name,
    op: placed.op.name,
    params: structuredClone(params),
    user,
  });
  return theDoor(placed, params, user);
};

const faux = fauxProvider({
  provider: "fireworks",
  models: [{ id: "small-model", contextWindow: 64_000 }],
});
const models = createModels();
models.setProvider(faux.provider);

/** A tool call's arguments, as a model sends them. */
type Args = Parameters<typeof fauxToolCall>[1];
type ModelCall = { name: string; args: Args; id?: string };
type Result = { id: string; tool: string; isError: boolean; text: string };

const textOf = (content: readonly { type: string; text?: string }[]) =>
  content.map((block) => block.text ?? "").join("");

/**
 * One message on a new conversation with the extension of `user`'s `catalog`: the model makes each call of `calls` in
 * one turn, then answers "Done.". What the model was offered at its first request, each tool result, the AG-UI events
 * of the run, and the text of the run's last answer.
 */
async function turn(
  calls: ModelCall[],
  { user = "ana", of = catalog }: { user?: string; of?: Catalog } = {},
) {
  doorCalls = [];
  const que = extension(of, call, user);
  const registry = createRegistry();
  registry.install(que);
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry },
    context,
  );
  try {
    let offered: Tool[] = [];
    faux.setResponses([
      (request) => {
        offered = request.messages.flatMap((m: Message) =>
          m.role === "system" ? (m.toolsAdded ?? []) : [],
        );
        return fauxAssistantMessage(
          calls.map(({ name, args, id }) => fauxToolCall(name, args, { id })),
          { stopReason: "toolUse" },
        );
      },
      fauxAssistantMessage(fauxText("Done.")),
    ]);
    const conversation = await harness.createConversation(
      {
        ownership: { kind: "ownerless" },
        agent: {
          model: { provider: "fireworks", modelId: "small-model" },
          extensions: [que],
        },
      },
      context,
    );
    const events = await watchEvents(harness, conversation.id, context);
    const agui = aguiRun();
    const out: AGUIEvent[] = [];
    const results: Result[] = [];
    let answer = "";
    const ended = new Promise<void>((end) =>
      events.start(async (batch) => {
        for (const event of batch) {
          out.push(...agui.of(event));
          if (event.type === "tool_execution_end" && event.entry) {
            const message = ToolResultEntry.is(event.entry)
              ? event.entry.model?.[0]
              : undefined;
            if (message?.role === "toolResult")
              results.push({
                id: message.toolCallId,
                tool: message.toolName,
                isError: message.isError,
                text: textOf(message.content),
              });
          }
          if (
            event.type === "message_end" &&
            event.entry.model?.[0]?.role === "assistant"
          ) {
            const message = event.entry.model[0];
            answer = textOf(message.content);
          }
          if (event.type === "run_end") end();
        }
      }),
    );
    await conversation.submit({ type: "input", content: "Go." }, context);
    await ended;
    await events.stop();
    return { offered, results, agui: out, answer };
  } finally {
    await harness.close(context);
  }
}

/** The result of the call `id`. */
const resultOf = (results: Result[], id: string) =>
  results.find((r) => r.id === id);

// pi's own text of a stack frame, or a path into an install.
const stack = /node_modules|\bat .*:\d+:\d+/;

test("given faux calling an op, when its tool runs, then the door is called once with that op, the arguments the model sent and the user, and the model gets the op's result", async () => {
  const ana = await turn([
    { name: "shop-get-order", args: { id: 4 }, id: "c1" },
  ]);
  assert.deepEqual(doorCalls, [
    { plugin: "shop", op: "shop-get-order", params: { id: 4 }, user: "ana" },
  ]);
  assert.deepEqual(resultOf(ana.results, "c1"), {
    id: "c1",
    tool: "shop-get-order",
    isError: false,
    text: JSON.stringify({ id: 4 }),
  });

  // The door is the one parse: a transform reaches it as the model's text, and a default is filled in by it alone.
  const bo = await turn(
    [
      { name: "shop-tag-orders", args: { ids: "a,b" }, id: "c1" },
      { name: "shop-list-orders", args: { customer: "Ana" }, id: "c2" },
    ],
    { user: "bo" },
  );
  assert.deepEqual(doorCalls, [
    {
      plugin: "shop",
      op: "shop-tag-orders",
      params: { ids: "a,b" },
      user: "bo",
    },
    {
      plugin: "shop",
      op: "shop-list-orders",
      params: { customer: "Ana" },
      user: "bo",
    },
  ]);
  assert.deepEqual(
    [resultOf(bo.results, "c1"), resultOf(bo.results, "c2")].map((r) => [
      r?.isError,
      r?.text,
    ]),
    [
      [false, JSON.stringify({ tagged: ["a", "b"] })],
      [false, JSON.stringify({ customer: "Ana", limit: 10 })],
    ],
  );
});

/** The AG-UI events of one tool call, in order. */
const eventsOfCall = (events: AGUIEvent[], id: string) =>
  events.filter((e) => "toolCallId" in e && e.toolCallId === id);

/** What the stream shows of one tool call: its name, its arguments, how its events go, and its result. */
const shown = (events: AGUIEvent[], id: string) => {
  const own = eventsOfCall(events, id);
  const start = own.find((e) => e.type === "TOOL_CALL_START");
  const result = own.find((e) => e.type === "TOOL_CALL_RESULT");
  const args = own
    .filter((e) => e.type === "TOOL_CALL_ARGS")
    .map((e) => ("delta" in e ? e.delta : ""))
    .join("");
  return {
    name: start && "toolCallName" in start ? start.toolCallName : undefined,
    args: args ? (JSON.parse(args) as unknown) : undefined,
    order: own
      .map((e) => e.type)
      .filter((type, i, types) => type !== types[i - 1]),
    result:
      result && "content" in result
        ? {
            messageId: result.messageId,
            role: result.role,
            content: result.content,
          }
        : undefined,
  };
};

test("given faux calling a tool, when the run streams, then the stream shows the call, its arguments and its result, before the answer", async () => {
  const one = await turn([
    { name: "shop-get-order", args: { id: 4 }, id: "c1" },
  ]);
  assert.deepEqual(shown(one.agui, "c1"), {
    name: "shop-get-order",
    args: { id: 4 },
    order: [
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
      "TOOL_CALL_RESULT",
    ],
    // A tool message's id is its call's id.
    result: {
      messageId: "c1",
      role: "tool",
      content: JSON.stringify({ id: 4 }),
    },
  });
  // The answer streams after the result.
  const types = one.agui.map((e) => e.type);
  assert.ok(
    types.lastIndexOf(EventType.TOOL_CALL_RESULT) <
      types.indexOf(EventType.TEXT_MESSAGE_START),
    `the events went ${types.join(", ")}`,
  );

  const other = await turn([
    { name: "read_skill", args: { id: "shop-returns" }, id: "k7" },
  ]);
  assert.deepEqual(shown(other.agui, "k7"), {
    name: "read_skill",
    args: { id: "shop-returns" },
    order: [
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
      "TOOL_CALL_RESULT",
    ],
    result: { messageId: "k7", role: "tool", content: "Return steps." },
  });
});

test("given a turn with two tool calls, when the run streams, then the stream shows both, each with its own result", async () => {
  const { agui, answer } = await turn([
    { name: "shop-get-order", args: { id: 4 }, id: "c1" },
    { name: "shop-list-orders", args: { customer: "Bo", limit: 2 }, id: "c2" },
  ]);
  assert.deepEqual(
    [shown(agui, "c1"), shown(agui, "c2")].map(({ name, args, result }) => ({
      name,
      args,
      result: result?.content,
    })),
    [
      {
        name: "shop-get-order",
        args: { id: 4 },
        result: JSON.stringify({ id: 4 }),
      },
      {
        name: "shop-list-orders",
        args: { customer: "Bo", limit: 2 },
        result: JSON.stringify({ customer: "Bo", limit: 2 }),
      },
    ],
  );
  // Each call starts once and has one result.
  assert.deepEqual(
    ["c1", "c2"].map((id) =>
      eventsOfCall(agui, id)
        .map((e) => e.type)
        .filter((t) => t === "TOOL_CALL_START" || t === "TOOL_CALL_RESULT"),
    ),
    [
      ["TOOL_CALL_START", "TOOL_CALL_RESULT"],
      ["TOOL_CALL_START", "TOOL_CALL_RESULT"],
    ],
  );
  assert.equal(answer, "Done.");
});

/** An op's input as its card gives it, with no other fields allowed. */
const cardInputs = (definition: typeof shop) =>
  cardOf({ definition, cases: [] }).extensions[
    "io.github.matta-kelly.que"
  ].ops.map((op) => ({
    name: op.name,
    description: `${op.title}: ${op.description}`,
    parameters: { ...op.input, additionalProperties: false },
  }));

/** The tools offered, by name, each with its JSON Schema apart from the draft it names. */
const offeredOps = (offered: Tool[], names: string[]) =>
  offered
    .filter((t) => names.includes(t.name))
    .map(({ name, description, parameters }) => {
      const { $schema, ...rest } = parameters as Record<string, unknown>;
      void $schema;
      return { name, description, parameters: rest };
    });

test("given a user's catalog, when the model is first asked, then it is offered every op, each with its JSON Schema as in the card, and the skill tool", async () => {
  const shopOps = shop.ops.map((op) => op.name);
  const { offered } = await turn([]);
  assert.deepEqual(offeredOps(offered, shopOps), cardInputs(shop));
  assert.deepEqual(
    offered.map((t) => t.name).sort(),
    [...shopOps, "read_skill"].sort(),
  );

  // Another catalog, with no skill: its op alone.
  const crmOps = crm.ops.map((op) => op.name);
  const other = await turn([], { of: crmOnly });
  assert.deepEqual(offeredOps(other.offered, crmOps), cardInputs(crm));
  assert.deepEqual(
    other.offered.map((t) => t.name),
    ["crm-find-contact"],
  );
});

test("given faux calling the skill tool, when it runs, then the model gets the skill's text", async () => {
  const { results } = await turn([
    { name: "read_skill", args: { id: "shop-refunds" }, id: "k1" },
    { name: "read_skill", args: { id: "shop-returns" }, id: "k2" },
  ]);
  assert.deepEqual(
    ["k1", "k2"].map((id) => {
      const r = resultOf(results, id);
      return [r?.isError, r?.text];
    }),
    [
      [false, "Refund steps."],
      [false, "Return steps."],
    ],
  );
});

test("given an op that throws an OpFailed, when the model calls it, then the model gets a failed call with the OpFailed's text, an op that answers is not one, and the run goes on", async () => {
  const { results, answer } = await turn([
    { name: "shop-get-order", args: { id: -1 }, id: "c1" },
    { name: "shop-get-order", args: { id: -2 }, id: "c2" },
    { name: "shop-get-order", args: { id: 4 }, id: "c3" },
  ]);
  const [missing, closed, answered] = ["c1", "c2", "c3"].map((id) =>
    resultOf(results, id),
  );
  assert.equal(missing?.isError, true);
  assert.match(String(missing?.text), /no such order/);
  assert.equal(closed?.isError, true);
  assert.match(String(closed?.text), /the shop is closed/);
  assert.deepEqual(
    [answered?.isError, answered?.text],
    [false, JSON.stringify({ id: 4 })],
  );
  assert.equal(answer, "Done.");
});

test("given arguments that fail the op's input schema, when the model calls it, then the model gets a failed call that names the field and the type it expected on one line, with no stack, and the run goes on", async () => {
  const { results, answer } = await turn([
    { name: "shop-get-order", args: { id: "a" }, id: "c1" },
    { name: "shop-list-orders", args: { customer: 5 }, id: "c2" },
  ]);
  const [id, customer] = ["c1", "c2"].map((call) => resultOf(results, call));
  assert.equal(id?.isError, true);
  assert.ok(
    String(id?.text)
      .split("\n")
      .some((line) => /\bid\b/.test(line) && /\bnumber\b/.test(line)),
    `the failed call says ${id?.text}`,
  );
  assert.doesNotMatch(String(id?.text), stack);
  assert.equal(customer?.isError, true);
  assert.ok(
    String(customer?.text)
      .split("\n")
      .some((line) => /\bcustomer\b/.test(line) && /\bstring\b/.test(line)),
    `the failed call says ${customer?.text}`,
  );
  assert.doesNotMatch(String(customer?.text), stack);
  assert.equal(answer, "Done.");
});

test("given a call to an op or a skill that is not there, when the model makes it, then it is a failed call, and the run goes on", async () => {
  const { results, answer } = await turn([
    { name: "shop-nope", args: {}, id: "c1" },
    { name: "read_skill", args: { id: "shop-nope" }, id: "c2" },
  ]);
  const [op, skillCall] = ["c1", "c2"].map((id) => resultOf(results, id));
  assert.equal(op?.isError, true);
  assert.equal(skillCall?.isError, true);
  assert.match(String(skillCall?.text), /no skill "shop-nope"/);
  assert.equal(answer, "Done.");
});

test("given arguments that break a refine or a transform, when the model calls the op, then the door's parse fails it with the path and the message, and the run goes on", async () => {
  const { results, answer } = await turn([
    { name: "shop-tag-orders", args: { ids: "a b" }, id: "c1" },
    { name: "shop-tag-orders", args: { ids: "a", meta: "{" }, id: "c2" },
    { name: "shop-tag-orders", args: { ids: "a,b" }, id: "c3" },
  ]);
  // Each one reached the door: its parse is the one that refused it.
  assert.deepEqual(
    doorCalls.map((c) => c.params),
    [{ ids: "a b" }, { ids: "a", meta: "{" }, { ids: "a,b" }],
  );
  const [spaced, notJson, answered] = ["c1", "c2", "c3"].map((id) =>
    resultOf(results, id),
  );
  assert.equal(spaced?.isError, true);
  assert.match(String(spaced?.text), /\bids\b.*ids has no spaces/);
  assert.equal(notJson?.isError, true);
  assert.ok(
    String(notJson?.text).includes(
      "Expected property name or '}' in JSON at position 1",
    ),
    String(notJson?.text),
  );
  assert.deepEqual(
    [answered?.isError, answered?.text],
    [false, JSON.stringify({ tagged: ["a", "b"] })],
  );
  assert.equal(answer, "Done.");
});

test("given an argument the op's input does not name, when the model calls it, then it is a failed call that names it, and the run goes on", async () => {
  const { results, answer } = await turn([
    {
      name: "shop-list-orders",
      args: { customer: "Ana", color: "red" },
      id: "c1",
    },
    { name: "shop-get-order", args: { id: 4, page: 2 }, id: "c2" },
  ]);
  const [color, page] = ["c1", "c2"].map((id) => resultOf(results, id));
  assert.equal(color?.isError, true);
  assert.match(String(color?.text), /\bcolor\b/);
  assert.equal(page?.isError, true);
  assert.match(String(page?.text), /\bpage\b/);
  assert.equal(answer, "Done.");
});

// Arguments a model can send: right ones, ones that break the refine or the type, extra fields.
const commaIds = fc.string({ unit: fc.constantFrom("a", "b", ",", " ") });
const modelArguments = fc.oneof(
  fc.record({ ids: commaIds }),
  fc.record({ ids: commaIds, extra: fc.jsonValue() }),
  fc.record({ ids: commaIds, meta: fc.string() }),
  fc.record({ ids: commaIds, meta: fc.json() }),
  fc.record({ ids: fc.jsonValue() }),
  fc.dictionary(fc.string(), fc.jsonValue()),
);
const toolOf = (name: string) =>
  extension(catalog, call, "ana").tools?.find((t) => t.name === name);

test("given any arguments the door accepts, when pi checks them against the op's tool, then the tool's JSON Schema accepts them too", async () => {
  const tagOrders = toolOf("shop-tag-orders");
  assert.ok(tagOrders, "the extension has no shop-tag-orders tool");
  const tagOp = { plugin: shop.plugin, op: shop.ops[2] };
  await fc.assert(
    fc.asyncProperty(modelArguments, async (args) => {
      const accepted = await theDoor(tagOp, args, "ana").then(
        () => true,
        () => false,
      );
      if (!accepted) return;
      assert.doesNotThrow(() =>
        validateToolArguments(tagOrders, {
          type: "toolCall",
          id: "c1",
          name: "shop-tag-orders",
          arguments: args as Args,
        }),
      );
    }),
  );
  // An extra argument is refused by both.
  const extra = { ids: "a,b", color: "red" };
  assert.ok(
    await theDoor(tagOp, extra, "ana").then(
      () => false,
      (error) => error instanceof OpFailed,
    ),
  );
  assert.throws(() =>
    validateToolArguments(tagOrders, {
      type: "toolCall",
      id: "c1",
      name: "shop-tag-orders",
      arguments: extra,
    }),
  );
});

test("given any arguments, when the model calls an op whose input has a refine and a transform, then its tool gives the op's result or a failed call that the door's OpFailed or pi's check made, and the run goes on", async () => {
  const tagOrders = toolOf("shop-tag-orders");
  assert.ok(tagOrders, "the extension has no shop-tag-orders tool");
  await fc.assert(
    fc.asyncProperty(modelArguments, async (args) => {
      const { results, answer } = await turn([
        { name: "shop-tag-orders", args: args as Args, id: "c1" },
      ]);
      const result = resultOf(results, "c1");
      assert.ok(result, "the call has no result");
      assert.equal(answer, "Done.", "the run did not go on to its answer");
      const [reached] = doorCalls;
      const outcome = reached
        ? await theDoor(
            { plugin: shop.plugin, op: shop.ops[2] },
            reached.params,
            "ana",
          ).then(
            (answered) => ({ answered }),
            (error: unknown) => ({ error }),
          )
        : undefined;
      if (outcome && "answered" in outcome)
        // The door answered: the model gets that answer, as JSON.
        assert.deepEqual(
          [result.isError, result.text],
          [false, JSON.stringify(outcome.answered)],
        );
      else if (outcome)
        // The door refused: an OpFailed, whose message the model gets.
        assert.ok(
          outcome.error instanceof OpFailed &&
            result.isError &&
            result.text.includes(outcome.error.message),
          `the door threw ${String(outcome.error)}; the model got ${result.text}`,
        );
      else {
        // It never reached the door: pi's check refused it, and the model gets a failed call.
        assert.throws(() =>
          validateToolArguments(tagOrders, {
            type: "toolCall",
            id: "c1",
            name: "shop-tag-orders",
            arguments: args as Args,
          }),
        );
        assert.equal(result.isError, true);
      }
    }),
    { numRuns: 40 },
  );
});
