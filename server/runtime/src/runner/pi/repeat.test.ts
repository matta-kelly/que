/**
 * The repeat guard on pi: the cases of the guard on LangGraph
 * (run/build/repeat.test.ts), each a run on a Harness of its own, on pi's
 * memory storage. pi-ai's scripted provider (`faux`) makes the model's calls,
 * one tool call to a response, so no model is called. A saved chat is the
 * turns before on the same conversation; one made before the guard is made
 * on a conversation that does not select it yet.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import {
  createRegistry,
  Harness,
  MemoryStorage,
  ToolResultEntry,
  watchEvents,
  type Extension,
} from "@earendil-works/pi-durable";
import * as z from "zod";
import { definePlugin, OpFailed } from "@mku1tra/que-plugin";
import type { Catalog } from "../../access/catalog.js";
import { door } from "../../assemble/door.js";
import { extension } from "./extension.js";
import { repeatGuard } from "./repeat.js";

/** What get-order fails with in this turn, for an order id below zero; with none, it answers. */
let failure: string | undefined;

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
        if (id < 0 && failure !== undefined) throw new OpFailed(failure);
        return { id };
      },
    },
  ],
});
const catalog: Catalog = [{ plugin: { definition: shop, skills: [] } }];

const failing = { id: -1 };

/** An error over pi's bound of a tool result (50KB and 2000 lines), so the saved result is not the whole error. */
const large = Array.from(
  { length: 3000 },
  (_, i) => `line ${i}: no such order`,
).join("\n");

const faux = fauxProvider({
  provider: "fireworks",
  models: [{ id: "small-model", contextWindow: 64_000 }],
});
const models = createModels();
models.setProvider(faux.provider);

type Args = Parameters<typeof fauxToolCall>[1];
type Result = { isError: boolean; text: string };

const textOf = (content: readonly { type: string; text?: string }[]) =>
  content.map((block) => block.text ?? "").join("");

/**
 * A chat on a new conversation with que's extension of the shop, for one
 * user, and the guard, unless `guarded` is false: then `guard` adds it later.
 */
async function chat({ guarded = true }: { guarded?: boolean } = {}) {
  const que = extension(
    catalog,
    door(async () => undefined),
    "ana",
  );
  const guard: Extension = { name: "que.repeat", hooks: repeatGuard };
  const registry = createRegistry();
  registry.install(que);
  registry.install(guard);
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry },
    context,
  );
  const conversation = await harness.createConversation(
    {
      ownership: { kind: "ownerless" },
      agent: {
        model: { provider: "fireworks", modelId: "small-model" },
        extensions: guarded ? [que, guard] : [que],
      },
    },
    context,
  );

  /**
   * One turn: the user asks, the model calls get-order with each argument
   * of `calls`, one call to a response, then answers `answer`; get-order
   * fails with `fails`. Each tool result of the turn, the text of its last
   * message (an answer or a tool result), and how many times the model was
   * called.
   */
  async function turn(
    calls: Args[],
    {
      answer = "Done.",
      fails = "no such order",
    }: { answer?: string; fails?: string | undefined } = {},
  ) {
    failure = fails;
    let modelCalls = 0;
    faux.setResponses([
      ...calls.map((args, i) => () => {
        modelCalls++;
        return fauxAssistantMessage(
          fauxToolCall("shop-get-order", args, { id: `c${i}` }),
          { stopReason: "toolUse" },
        );
      }),
      () => {
        modelCalls++;
        return fauxAssistantMessage(fauxText(answer));
      },
    ]);
    const events = await watchEvents(harness, conversation.id, context);
    const results: Result[] = [];
    let last = "";
    const ended = new Promise<void>((end) =>
      events.start(async (batch) => {
        for (const event of batch) {
          if (event.type === "tool_execution_end" && event.entry) {
            const message = ToolResultEntry.is(event.entry)
              ? event.entry.model?.[0]
              : undefined;
            if (message?.role === "toolResult") {
              results.push({
                isError: message.isError,
                text: textOf(message.content),
              });
              last = textOf(message.content);
            }
          }
          if (
            event.type === "message_end" &&
            event.entry.model?.[0]?.role === "assistant"
          )
            last = textOf(event.entry.model[0].content);
          if (event.type === "run_end") end();
        }
      }),
    );
    await conversation.submit(
      { type: "input", content: "Get order -1." },
      context,
    );
    await ended;
    await events.stop();
    return { results, last, modelCalls };
  }

  return {
    turn,
    /** The conversation selects the guard from its next run. */
    guard: () =>
      conversation.configure({ extensions: { add: [guard] } }, context),
    close: () => harness.close(context),
  };
}

/** A chat made before the guard: one turn for each error of `saved` (none: get-order answered), then the guard. */
async function savedChat(saved: (string | undefined)[]) {
  const c = await chat({ guarded: false });
  for (const fails of saved)
    await c.turn([failing], { answer: "That did not work.", fails });
  await c.guard();
  return c;
}

const timeout = 20_000;

test(
  "given a model that calls get-order five times with the same arguments and the same error, when the third call fails, then the run ends with no other model call, on a message that names the call and the error",
  { timeout },
  async () => {
    const c = await chat();
    try {
      const { results, last, modelCalls } = await c.turn([
        failing,
        failing,
        failing,
        failing,
        failing,
      ]);
      assert.equal(results.length, 3);
      assert.equal(modelCalls, 3);
      assert.match(last, /shop-get-order/);
      assert.match(last, /\{"id":-1\}/);
      assert.match(last, /no such order/);
    } finally {
      await c.close();
    }
  },
);

test(
  "given an error over pi's bound of a tool result, when the same call fails with it three times, then the run ends with no other model call, on a message that names the call and the error",
  { timeout },
  async () => {
    const c = await chat();
    try {
      const { results, last, modelCalls } = await c.turn(
        [failing, failing, failing, failing, failing],
        { fails: large },
      );
      assert.equal(results.length, 3);
      assert.equal(modelCalls, 3);
      assert.match(last, /shop-get-order\(\{"id":-1\}\)/);
      assert.match(last, /line 0: no such order/);
    } finally {
      await c.close();
    }
  },
);

test(
  "given a saved chat in which the call failed twice, when it fails again in a new turn, then the run ends: the count comes from the saved chat",
  { timeout },
  async () => {
    const c = await savedChat(["no such order", "no such order"]);
    try {
      const { results, last, modelCalls } = await c.turn([
        failing,
        failing,
        failing,
      ]);
      assert.equal(results.length, 1);
      assert.equal(modelCalls, 1);
      assert.match(last, /no such order/);
    } finally {
      await c.close();
    }
  },
);

test(
  "given a saved chat in which the call failed twice and then answered, when it fails twice more, then the run goes on to the answer",
  { timeout },
  async () => {
    const c = await savedChat(["no such order", "no such order", undefined]);
    try {
      const { results, last } = await c.turn([failing, failing]);
      assert.equal(results.length, 2);
      assert.equal(last, "Done.");
    } finally {
      await c.close();
    }
  },
);

test(
  "given a saved chat in which the call failed twice with another error, when it fails twice with a new one, then the run goes on to the answer",
  { timeout },
  async () => {
    const c = await savedChat(["the shop is down", "the shop is down"]);
    try {
      const { results, last } = await c.turn([failing, failing]);
      assert.equal(results.length, 2);
      assert.equal(last, "Done.");
    } finally {
      await c.close();
    }
  },
);

test(
  "given two failed calls, when a third with other arguments fails the same way, then the run goes on to the answer",
  { timeout },
  async () => {
    const c = await chat();
    try {
      const { results, last } = await c.turn([failing, failing, { id: -2 }]);
      assert.equal(results.length, 3);
      assert.equal(last, "Done.");
    } finally {
      await c.close();
    }
  },
);

test(
  "given a saved chat in which the call failed three times and the model then answered, when the user writes again, then the model is called",
  { timeout },
  async () => {
    const c = await chat({ guarded: false });
    try {
      await c.turn([failing, failing, failing], { answer: "I stopped." });
      await c.guard();
      const { last, modelCalls } = await c.turn([]);
      assert.equal(modelCalls, 1);
      assert.equal(last, "Done.");
    } finally {
      await c.close();
    }
  },
);

test(
  "given a chat whose run the guard stopped on the result that reached the stop, when the user writes again, then the model is called",
  { timeout },
  async () => {
    const c = await chat();
    try {
      const stopped = await c.turn([failing, failing, failing]);
      // The guard stopped it: the chat ends in the third result, with no reply of the model.
      assert.deepEqual(
        [stopped.results.length, stopped.modelCalls],
        [3, 3],
        "the guard did not stop the run that makes the saved chat",
      );
      const { last, modelCalls } = await c.turn([]);
      assert.equal(modelCalls, 1);
      assert.equal(last, "Done.");
    } finally {
      await c.close();
    }
  },
);

test(
  "given a saved chat in which the call failed three times, when it fails a fourth time, then the stop message says it failed 4 times in a row",
  { timeout },
  async () => {
    const c = await chat({ guarded: false });
    try {
      await c.turn([failing, failing, failing], { answer: "I stopped." });
      await c.guard();
      const { last } = await c.turn([failing]);
      assert.match(last, /failed 4 times in a row/);
    } finally {
      await c.close();
    }
  },
);

test(
  "given a model that calls get-order five times with arguments that fail the op's schema, when the third is refused, then the run ends with no other model call, on a message that names the call",
  { timeout },
  async () => {
    const wrong = { id: "a" };
    const c = await chat();
    try {
      const { results, last, modelCalls } = await c.turn([
        wrong,
        wrong,
        wrong,
        wrong,
        wrong,
      ]);
      assert.equal(results.length, 3);
      assert.equal(modelCalls, 3);
      assert.match(last, /shop-get-order\(\{"id":"a"\}\)/);
    } finally {
      await c.close();
    }
  },
);
