/**
 * que's catalog as a pi Extension, and its tool calls in the AG-UI stream. Each run is on a Harness of its own, on
 * pi's memory storage, with the extension of one user's catalog selected; pi-ai's scripted provider (`faux`) makes
 * the model's calls, so no model is called. Each op's tool runs through the door, which a spy records. The tests up to
 * the agent's loading are on an eager config.
 */

import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type { Message, Tool } from "@earendil-works/pi-ai";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  type FauxResponseFactory,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import {
  getCurrentSystemPrompt,
  getCurrentTools,
} from "@earendil-works/pi-ai/utils/transcript";
import { validateToolArguments } from "@earendil-works/pi-ai/utils/validation";
import {
  createRegistry,
  Harness,
  MemoryStorage,
  ToolResultEntry,
  watchEvents,
  type Conversation,
  type Storage,
} from "@earendil-works/pi-durable";
import { openNodeJsonlStorage } from "@earendil-works/pi-durable/storage/jsonl/node";
import { EventType, type AGUIEvent } from "@ag-ui/core";
import fc from "fast-check";
import * as z from "zod";
import { cardOf, definePlugin, OpFailed } from "@mku1tra/que-plugin";
import type { Catalog } from "../../access/catalog.js";
import { door, type Call } from "../../assemble/door.js";
import { eager } from "../../assemble/eager/index.js";
import {
  besideNothing,
  catalog as fixtureCatalog,
  identityOnly,
  mixed,
  skillsOnly,
} from "../../assemble/fixture.js";
import { onDemand } from "../../assemble/on-demand/index.js";
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
    {
      name: "shop-forget-order",
      type: "op",
      title: "Forget order",
      description: "Forgets one order, and gives back nothing.",
      input: z.object({ id: z.number().describe("Order id") }),
      run: async () => undefined,
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
const shopSkills = [
  skill("shop-refunds", "Refund", "Refund steps."),
  skill("shop-returns", "Return", "Return steps."),
];
const catalog: Catalog = [
  {
    plugin: {
      definition: shop,
      skills: shopSkills,
      card: cardOf({ definition: shop, cases: [], skills: shopSkills }),
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
const crmOnly: Catalog = [
  {
    plugin: {
      definition: crm,
      skills: [],
      card: cardOf({ definition: crm, cases: [] }),
    },
  },
];

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
  // The extension takes its name where it is installed: here, one Harness per turn.
  const que = { ...extension(of, call, user, eager), name: "que" };
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

test("given faux calling an op, when its tool runs, then the door is called once with that op, the arguments after pi's check and the user, and the model gets the op's result", async () => {
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

test("given arguments that fail the op's input schema and that pi cannot convert, when the model calls it, then the model gets a failed call that names the field and the type it expected on one line, with no stack, and the run goes on", async () => {
  const { results, answer } = await turn([
    { name: "shop-get-order", args: { id: "a" }, id: "c1" },
    // pi's check converts what it can (5 to "5" for a string): an object it cannot, so it refuses it.
    { name: "shop-list-orders", args: { customer: {} }, id: "c2" },
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
  extension(catalog, call, "ana", eager).tools?.find((t) => t.name === name);

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

test("given an op whose run gives back nothing, when the model calls it, then the model gets the JSON text null, and the run goes on", async () => {
  const { results, answer } = await turn([
    { name: "shop-forget-order", args: { id: 4 }, id: "c1" },
    { name: "shop-get-order", args: { id: 5 }, id: "c2" },
    { name: "shop-forget-order", args: { id: 6 }, id: "c3" },
  ]);
  assert.deepEqual(
    ["c1", "c2", "c3"].map((id) => {
      const r = resultOf(results, id);
      return [r?.isError, r?.text];
    }),
    [
      [false, "null"],
      [false, JSON.stringify({ id: 5 })],
      [false, "null"],
    ],
  );
  assert.equal(answer, "Done.");
});

// The agent's loading. A chat runs on a Harness on one storage, which can be closed and opened again on it; faux
// records the tools offered at each request of a chat (pi-ai's replay of the request's system messages) and its
// messages, and answers a compaction's request with a summary.

const SUMMARY = "The user asked for order 4.";

type Request = { tools: Tool[]; messages: Message[] };

/**
 * faux makes each step's calls in one turn, in order, and answers "Done." at an empty step or when the steps are
 * used up. Each chat request is recorded, a compaction's is not.
 */
function script(steps: ModelCall[][]) {
  const requests: Request[] = [];
  const queue = [...steps];
  const respond: FauxResponseFactory = (request) => {
    if (
      getCurrentSystemPrompt(request.messages).includes(
        "context summarization assistant",
      )
    )
      return fauxAssistantMessage(fauxText(SUMMARY));
    requests.push({
      tools: getCurrentTools(request.messages),
      messages: [...request.messages],
    });
    const calls = queue.shift() ?? [];
    return calls.length
      ? fauxAssistantMessage(
          calls.map(({ name, args, id }) => fauxToolCall(name, args, { id })),
          { stopReason: "toolUse" },
        )
      : fauxAssistantMessage(fauxText("Done."));
  };
  faux.setResponses(Array.from({ length: 50 }, () => respond));
  return requests;
}

/** The names of the tools a request offered, sorted. */
const namesOf = (request: Request | undefined) =>
  (request?.tools ?? []).map((t) => t.name).sort();

/** The text of the tool result of the call `id`, as the model got it in a later request, and whether it failed. */
const toolResultIn = (requests: Request[], id: string) => {
  for (const { messages } of requests)
    for (const m of messages)
      if (m.role === "toolResult" && m.toolCallId === id)
        return { isError: m.isError, text: textOf(m.content) };
  return undefined;
};

type Way = Parameters<typeof extension>[3];

/** A Harness on `storage` with `user`'s extension of `of` on `way` installed. */
async function harnessOn(
  storage: Storage,
  way: Way,
  { of = catalog, user = "ana" }: { of?: Catalog; user?: string } = {},
) {
  const que = { ...extension(of, call, user, way), name: "que" };
  const registry = createRegistry();
  registry.install(que);
  // No compaction of pi's own: a test compacts when it says so, and the summary keeps only the newest turn.
  const harness = await Harness.open(
    storage,
    {
      models,
      registry,
      settings: { compaction: { enabled: false, keepRecentTokens: 1 } },
    },
    context,
  );
  const chat = () =>
    harness.createConversation(
      {
        ownership: { kind: "ownerless" },
        agent: {
          model: { provider: "fireworks", modelId: "small-model" },
          extensions: [que],
        },
      },
      context,
    );
  return { harness, chat };
}

/** One message on the conversation, to the end of its run. */
async function say(conversation: Conversation, content: string) {
  const submission = await conversation.submit(
    { type: "input", content },
    context,
  );
  await submission.wait(context);
}

/** A compaction of the conversation, placed. */
async function compact(harness: Harness, conversation: Conversation) {
  const id = await conversation.compact(undefined, context);
  const { outcome } = (await harness.waitForTask(id, context)).state;
  assert.ok(
    outcome.status === "completed" && outcome.result.submissionId,
    `the compaction did not place a summary: ${JSON.stringify(outcome)}`,
  );
  const placed = await harness.submission(outcome.result.submissionId, context);
  await placed?.wait(context);
}

const shopOps = shop.ops.map((op) => op.name);
const load = (operation: string, id: string, plugin = "shop"): ModelCall => ({
  name: "load_operation",
  args: { plugin, operation },
  id,
});

test("given an on-demand config, when the model is first asked, then it is offered open_plugin, load_operation and read_skill, and no op", async () => {
  const requests = script([]);
  const { harness, chat } = await harnessOn(new MemoryStorage(), onDemand);
  try {
    await say(await chat(), "Go.");
  } finally {
    await harness.close(context);
  }
  assert.deepEqual(namesOf(requests[0]), [
    "load_operation",
    "open_plugin",
    "read_skill",
  ]);

  // A catalog with no skill: no read_skill, and still no op.
  const other = script([]);
  const second = await harnessOn(new MemoryStorage(), onDemand, {
    of: crmOnly,
  });
  try {
    await say(await second.chat(), "Go.");
  } finally {
    await second.harness.close(context);
  }
  assert.deepEqual(namesOf(other[0]), ["load_operation", "open_plugin"]);
});

test("given an on-demand config, when the model loads an op, then the op is offered from the next request with its JSON Schema as in the card, the others stay deferred, and the model can call it", async () => {
  const requests = script([
    [load("shop-get-order", "l1")],
    [{ name: "shop-get-order", args: { id: 4 }, id: "c1" }],
    [],
  ]);
  doorCalls = [];
  const { harness, chat } = await harnessOn(new MemoryStorage(), onDemand);
  try {
    await say(await chat(), "Go.");
  } finally {
    await harness.close(context);
  }
  assert.deepEqual(
    requests.map((r) => namesOf(r).filter((name) => shopOps.includes(name))),
    [[], ["shop-get-order"], ["shop-get-order"]],
  );
  assert.deepEqual(
    offeredOps(requests[1].tools, shopOps),
    cardInputs(shop).filter((t) => t.name === "shop-get-order"),
  );
  // load_operation says which tool the op became.
  const loaded = toolResultIn(requests, "l1");
  assert.equal(loaded?.isError, false);
  assert.ok(String(loaded?.text).includes("`shop-get-order`"), loaded?.text);
  assert.deepEqual(doorCalls, [
    { plugin: "shop", op: "shop-get-order", params: { id: 4 }, user: "ana" },
  ]);
  assert.deepEqual(toolResultIn(requests, "c1"), {
    isError: false,
    text: JSON.stringify({ id: 4 }),
  });
});

test("given an on-demand config, when the model loads two ops at once, then both are offered from the next request, and no other", async () => {
  const requests = script([
    [load("shop-list-orders", "l1"), load("shop-tag-orders", "l2")],
    [],
  ]);
  const { harness, chat } = await harnessOn(new MemoryStorage(), onDemand);
  try {
    await say(await chat(), "Go.");
  } finally {
    await harness.close(context);
  }
  assert.deepEqual(
    namesOf(requests[1]).filter((name) => shopOps.includes(name)),
    ["shop-list-orders", "shop-tag-orders"],
  );
});

test("given an on-demand config, when the model calls an op it has not loaded, then it is a failed call, the door is not called, and the run goes on", async () => {
  const requests = script([
    [
      { name: "shop-get-order", args: { id: 4 }, id: "c1" },
      { name: "shop-list-orders", args: { customer: "Ana" }, id: "c2" },
    ],
    [],
  ]);
  doorCalls = [];
  const { harness, chat } = await harnessOn(new MemoryStorage(), onDemand);
  try {
    await say(await chat(), "Go.");
  } finally {
    await harness.close(context);
  }
  assert.deepEqual(
    ["c1", "c2"].map((id) => toolResultIn(requests, id)?.isError),
    [true, true],
  );
  assert.deepEqual(doorCalls, []);
  // The run went on to the model's answer, after the two failed calls.
  assert.equal(requests.length, 2);
});

test("given an on-demand config, when a load fails, then it names what there is, and no op is offered", async () => {
  const requests = script([
    [
      load("shop-nope", "l1"),
      load("shop-get-order", "l2", "nope"),
      load("crm-find-contact", "l3"),
    ],
    [],
  ]);
  const { harness, chat } = await harnessOn(new MemoryStorage(), onDemand);
  try {
    await say(await chat(), "Go.");
  } finally {
    await harness.close(context);
  }
  const [op, plugin, elsewhere] = ["l1", "l2", "l3"].map((id) =>
    toolResultIn(requests, id),
  );
  // An op the plugin does not hold: the failed call names the ones it does.
  assert.equal(op?.isError, true);
  assert.match(String(op?.text), /shop-get-order/);
  assert.match(String(op?.text), /shop-forget-order/);
  // A plugin that is not there: the failed call names the ones that are.
  assert.equal(plugin?.isError, true);
  assert.match(String(plugin?.text), /\bshop\b/);
  // An op of another plugin, not in this user's catalog.
  assert.equal(elsewhere?.isError, true);
  assert.deepEqual(
    requests.map((r) => namesOf(r).filter((name) => shopOps.includes(name))),
    [[], []],
  );
});

test("given an on-demand chat that loaded an op, when the user sends again, then the op is offered at each later request of that chat, and in no other chat", async () => {
  const requests = script([[load("shop-get-order", "l1")], [], [], []]);
  const { harness, chat } = await harnessOn(new MemoryStorage(), onDemand);
  try {
    const conversation = await chat();
    await say(conversation, "Go.");
    await say(conversation, "And again.");
    await say(conversation, "Once more.");
    // Another chat of the same user, on the same Harness: nothing loaded there.
    await say(await chat(), "Go.");
  } finally {
    await harness.close(context);
  }
  assert.equal(requests.length, 5);
  assert.deepEqual(
    requests.map((r) => namesOf(r).filter((name) => shopOps.includes(name))),
    [[], ["shop-get-order"], ["shop-get-order"], ["shop-get-order"], []],
  );
});

test("given an on-demand chat that loaded an op, when it is compacted, then the next request is on the summary and still offers the op", async () => {
  const requests = script([[load("shop-tag-orders", "l1")], [], [], []]);
  const { harness, chat } = await harnessOn(new MemoryStorage(), onDemand);
  try {
    const conversation = await chat();
    await say(conversation, "Go.");
    await say(conversation, "And again.");
    await compact(harness, conversation);
    await say(conversation, "After the summary.");
  } finally {
    await harness.close(context);
  }
  const after = requests.at(-1);
  const said = (after?.messages ?? []).map((m) =>
    m.role === "user"
      ? typeof m.content === "string"
        ? m.content
        : textOf(m.content)
      : "",
  );
  // The compaction is in effect: the first message is summarized away.
  assert.ok(
    said.some((text) => text.includes(SUMMARY)),
    `the request after the compaction has no summary: ${said.join(" | ")}`,
  );
  assert.ok(!said.includes("Go."), said.join(" | "));
  assert.deepEqual(
    namesOf(after).filter((name) => shopOps.includes(name)),
    ["shop-tag-orders"],
  );
});

test("given an on-demand chat that loaded an op, when its Harness is closed and opened again on the same storage, then the chat still offers the op, and only that one", async () => {
  // Storage on disk (pi's JSONL), each open a new Storage on the same files: nothing is kept in memory across them.
  const directory = await mkdtemp(join(tmpdir(), "que-loading-"));
  try {
    const requests = script([[load("shop-list-orders", "l1")], [], []]);
    const first = await harnessOn(
      await openNodeJsonlStorage(directory, context),
      onDemand,
    );
    let id!: Conversation["id"];
    try {
      const conversation = await first.chat();
      id = conversation.id;
      await say(conversation, "Go.");
    } finally {
      await first.harness.close(context);
    }
    const second = await harnessOn(
      await openNodeJsonlStorage(directory, context),
      onDemand,
    );
    try {
      const conversation = await second.harness.conversation(id, context);
      assert.ok(conversation, "the chat is not on the storage");
      await say(conversation, "After the restart.");
      // A new chat on the reopened Harness has nothing loaded.
      await say(await second.chat(), "Go.");
    } finally {
      await second.harness.close(context);
    }
    assert.deepEqual(
      requests.map((r) => namesOf(r).filter((name) => shopOps.includes(name))),
      [[], ["shop-list-orders"], ["shop-list-orders"], []],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("given an eager config, when the model is first asked, then it is offered every op and read_skill, and nothing to open or load, at each request", async () => {
  const requests = script([[], []]);
  const { harness, chat } = await harnessOn(new MemoryStorage(), eager);
  try {
    const conversation = await chat();
    await say(conversation, "Go.");
    await say(conversation, "And again.");
  } finally {
    await harness.close(context);
  }
  const all = [...shopOps, "read_skill"].sort();
  assert.deepEqual(requests.map(namesOf), [all, all]);
  assert.deepEqual(offeredOps(requests[0].tools, shopOps), cardInputs(shop));

  // A catalog with no skill: its op alone.
  const other = script([]);
  const second = await harnessOn(new MemoryStorage(), eager, { of: crmOnly });
  try {
    await say(await second.chat(), "Go.");
  } finally {
    await second.harness.close(context);
  }
  assert.deepEqual(namesOf(other[0]), ["crm-find-contact"]);
});

/** The tools offered at the first request of a chat on `way` with the catalog `of`. */
async function firstOffered(way: Way, of: Catalog) {
  const requests = script([]);
  const { harness, chat } = await harnessOn(new MemoryStorage(), way, { of });
  try {
    await say(await chat(), "Go.");
  } finally {
    await harness.close(context);
  }
  return requests[0]?.tools ?? [];
}

const descriptionOf = (tools: Tool[], name: string) =>
  tools.find((t) => t.name === name)?.description;

test("given either config, when the model is offered read_skill, then its description sends the agent where that way lists a skill's id: the prompt or open_plugin on demand, the prompt alone when eager, which has no open_plugin", async () => {
  assert.deepEqual(
    {
      onDemand: descriptionOf(
        await firstOffered(onDemand, catalog),
        "read_skill",
      ),
      eager: descriptionOf(await firstOffered(eager, catalog), "read_skill"),
    },
    {
      onDemand:
        "Read Skill: returns the full text of a skill, by its id, as the prompt or open_plugin lists it.",
      eager:
        "Read Skill: returns the full text of a skill, by its id, as the prompt lists it.",
    },
  );
});

test("given an on-demand config, when the model opens a plugin, then it gets each op and skill in one line, with no arguments, and a plugin that is not there names the ones that are", async () => {
  const requests = script([
    [
      { name: "open_plugin", args: { plugin: "shop" }, id: "o1" },
      { name: "open_plugin", args: { plugin: "notes" }, id: "o2" },
      { name: "open_plugin", args: { plugin: "nope" }, id: "o3" },
    ],
    [],
  ]);
  const { harness, chat } = await harnessOn(new MemoryStorage(), onDemand, {
    of: mixed,
  });
  try {
    await say(await chat(), "Go.");
  } finally {
    await harness.close(context);
  }
  const [shopText, notesText, nope] = ["o1", "o2", "o3"].map((id) =>
    toolResultIn(requests, id),
  );
  assert.equal(shopText?.isError, false);
  assert.match(
    String(shopText?.text),
    /shop-find-orders: Find orders\. Search orders by customer name\./,
  );
  assert.match(
    String(shopText?.text),
    /shop-get-order: Get order\. One order with its lines\./,
  );
  assert.match(
    String(shopText?.text),
    /shop-refunds: Refunds\. How to refund an order\./,
  );
  assert.doesNotMatch(String(shopText?.text), /Returns at most 20/);
  assert.doesNotMatch(String(shopText?.text), /Customer name/);
  // A plugin with skills alone has no Operations heading.
  assert.equal(notesText?.isError, false);
  assert.doesNotMatch(String(notesText?.text), /Operations/);
  assert.match(
    String(notesText?.text),
    /notes-meetings: Meetings\. How to write up a meeting\./,
  );
  assert.equal(nope?.isError, true);
  assert.match(String(nope?.text), /\bshop\b/);
  assert.match(String(nope?.text), /\bnotes\b/);
});

test("given an on-demand config, when the model is first asked, then the tools to open and load are the ones the catalog holds something for, with their descriptions word for word", async () => {
  const withOps = await firstOffered(onDemand, fixtureCatalog);
  assert.deepEqual(namesOf({ tools: withOps, messages: [] }), [
    "load_operation",
    "open_plugin",
    "read_skill",
  ]);
  assert.equal(
    descriptionOf(withOps, "open_plugin"),
    "Open Plugin: lists what a plugin holds, its operations and skills, with one line each. Use it to find the operation for a task. It does not make an operation callable; load_operation does.",
  );
  assert.equal(
    descriptionOf(withOps, "load_operation"),
    "Load Operation: makes one operation callable. From your next step it is a tool of the operation's name, with its full description and arguments, and it stays for the rest of the conversation. Load each operation you need before calling it; you can load several at once.",
  );
  // Skills alone: nothing to load, and open_plugin names no operation.
  const skillsAlone = await firstOffered(onDemand, skillsOnly);
  assert.deepEqual(namesOf({ tools: skillsAlone, messages: [] }), [
    "open_plugin",
    "read_skill",
  ]);
  assert.equal(
    descriptionOf(skillsAlone, "open_plugin"),
    "Open Plugin: lists what a plugin holds, with one line each.",
  );
  // A plugin that holds nothing beside one that holds ops and a skill: every tool stays.
  assert.deepEqual(
    namesOf({
      tools: await firstOffered(onDemand, besideNothing),
      messages: [],
    }),
    ["load_operation", "open_plugin", "read_skill"],
  );
});

test("given either config and a catalog that holds no op and no skill, when the model is first asked, then it is offered no tool", async () => {
  for (const way of [onDemand, eager])
    assert.deepEqual(
      (await firstOffered(way, identityOnly)).map((t) => t.name),
      [],
      way.name,
    );
});
