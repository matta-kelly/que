/**
 * The repeat guard on pi: the cases of the guard on LangGraph
 * (run/build/repeat.test.ts), each a run on a Harness of its own, on pi's
 * memory storage. pi-ai's scripted provider (`faux`) makes the model's calls,
 * one tool call to a response, so no model is called. The guard is in
 * que's run of each tool, so every run has it. A saved chat is the turns
 * before on the same conversation.
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
} from "@earendil-works/pi-durable";
import * as z from "zod";
import { definePlugin, OpFailed } from "@mku1tra/que-plugin";
import type { Catalog } from "../../access/catalog.js";
import { door } from "../../assemble/door.js";
import { extension } from "./extension.js";

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
  // A window so large that pi's compaction never starts, so faux answers only the run's requests.
  models: [{ id: "small-model", contextWindow: 1_000_000 }],
});
const models = createModels();
models.setProvider(faux.provider);

type Args = Parameters<typeof fauxToolCall>[1];
type Result = { id: string; isError: boolean; text: string };

const textOf = (content: readonly { type: string; text?: string }[]) =>
  content.map((block) => block.text ?? "").join("");

/** A chat on a new conversation with que's extension of the shop, for one user. */
async function chat() {
  // The extension takes its name where it is installed: here, one Harness per chat.
  const que = {
    ...extension(
      catalog,
      door(async () => undefined),
      "ana",
    ),
    name: "que",
  };
  const registry = createRegistry();
  registry.install(que);
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
        extensions: [que],
      },
    },
    context,
  );

  /**
   * One turn: the user asks, the model calls get-order with each argument
   * of `calls`, one response for each, then answers `answer`; a list of
   * arguments is one response with a call for each, the call `c<i>.<j>`
   * (else `c<i>`). get-order
   * fails with `fails`, and answers when `fails` is given as undefined.
   * Each tool result of the turn, the text of its last
   * message (an answer or a tool result), and how many times the model was
   * called.
   */
  async function turn(
    calls: (Args | Args[])[],
    given: { answer?: string; fails?: string | undefined } = {},
  ) {
    const answer = given.answer ?? "Done.";
    failure = "fails" in given ? given.fails : "no such order";
    let modelCalls = 0;
    faux.setResponses([
      ...calls.map((args, i) => () => {
        modelCalls++;
        return fauxAssistantMessage(
          Array.isArray(args)
            ? args.map((one, j) =>
                fauxToolCall("shop-get-order", one, { id: `c${i}.${j}` }),
              )
            : fauxToolCall("shop-get-order", args, { id: `c${i}` }),
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
                id: message.toolCallId,
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
    close: () => harness.close(context),
  };
}

/** A saved chat: one turn for each error of `saved` (undefined: get-order answered), each ended by the model's answer. */
async function savedChat(saved: (string | undefined)[]) {
  const c = await chat();
  for (const fails of saved)
    await c.turn([failing], { answer: "That did not work.", fails });
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
    const c = await chat();
    try {
      // The guard stops this turn on its third result.
      await c.turn([failing, failing, failing]);
      const { last } = await c.turn([failing]);
      assert.match(last, /failed 4 times in a row/);
    } finally {
      await c.close();
    }
  },
);

/**
 * A turn of six responses, each with the stuck call beside `sibling`, then
 * "Done.". The guard stops the run on the third round: its stuck call's
 * result names the call and the error, and the model is called once more
 * at most, never as far as the answer.
 */
async function mixedRounds(sibling: Args) {
  const c = await chat();
  try {
    const round = [failing, sibling];
    const { results, last, modelCalls } = await c.turn(
      Array.from({ length: 6 }, () => round),
    );
    assert.ok(
      modelCalls <= 4,
      `the model was called ${modelCalls} times, past the stop round and one more`,
    );
    assert.notEqual(last, "Done.");
    const stuck = results.find((r) => r.id === "c2.0");
    assert.match(String(stuck?.text), /shop-get-order\(\{"id":-1\}\)/);
    assert.match(String(stuck?.text), /failed 3 times in a row/);
    assert.match(String(stuck?.text), /no such order/);
  } finally {
    await c.close();
  }
}

test(
  "given a model that calls the stuck call beside a call that answers, in every response, when the stuck call fails the third time, then the run ends within one more model call, on the stuck call's result that names it and the error",
  { timeout },
  () => mixedRounds({ id: 4 }),
);

test(
  "given a model that calls the stuck call beside a call that pi refuses for its schema, in every response, when the stuck call fails the third time, then the run ends within one more model call, on the stuck call's result that names it and the error",
  { timeout },
  () => mixedRounds({ id: "a" }),
);

test(
  "given a long saved chat in which the call failed once, then 60 turns of another call that answered, then failed once more, when it fails again, then the run ends on that call",
  { timeout: 60_000 },
  async () => {
    const c = await chat();
    try {
      await c.turn([failing], { answer: "That did not work." });
      for (let i = 0; i < 60; i++)
        await c.turn([{ id: i }], { answer: "Here it is." });
      await c.turn([failing], { answer: "That did not work." });
      const { results, last, modelCalls } = await c.turn([failing, failing]);
      assert.equal(results.length, 1);
      assert.equal(modelCalls, 1);
      assert.match(last, /failed 3 times in a row/);
    } finally {
      await c.close();
    }
  },
);

test(
  "given a long saved chat of 60 turns in which the call failed twice, then answered, when it fails twice more, then the run goes on to the answer",
  { timeout: 60_000 },
  async () => {
    const c = await chat();
    try {
      await c.turn([failing], { answer: "That did not work." });
      for (let i = 0; i < 60; i++)
        await c.turn([{ id: i }], { answer: "Here it is." });
      await c.turn([failing], { answer: "That did not work." });
      await c.turn([failing], { answer: "Here it is.", fails: undefined });
      const { results, last } = await c.turn([failing, failing]);
      assert.equal(results.length, 2);
      assert.equal(last, "Done.");
    } finally {
      await c.close();
    }
  },
);

// Known gap: pi refuses a call whose arguments fail the op's schema before any hook or tool code runs, so the guard
// never sees it, and pi has no cap on a run's steps (kinetic issue pi-durable-hook-transcript).
test.todo(
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
