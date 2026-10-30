/**
 * The repeat guard on pi: a call that fails the same way three times in a row
 * ends the run, an op's call and a load alike; the count is kept across the
 * turns of a saved chat, and starts again when the call answers, fails with
 * another error or has other arguments. Each case is a run on a Harness of its
 * own, on pi's memory storage. pi-ai's scripted provider (`faux`) makes the
 * model's calls, one tool call to a response, so no model is called. The
 * guard is in que's run of each tool, so every run has it. A saved chat is
 * the turns before on the same conversation.
 *
 * A round with more than one call is stopped by que's host, in the watch of
 * harness.ts's run, so those cases run through that run, on a thread of
 * their own: on a database of their own (PGlite, served on a local port) and
 * the fixture deployment "two".
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { EventType, type AGUIEvent } from "@ag-ui/core";
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
import { definePlugin, OpFailed, cardOf } from "@mku1tra/que-plugin";
import type { Model } from "@mku1tra/que-harness";
import { createStore } from "@que/threads";
import type { Catalog } from "../../access/catalog.js";
import { door } from "../../assemble/door.js";
import { deploymentRoot } from "../../../../tests/deployment-root.js";
import { eager } from "../../assemble/eager/index.js";
import { onDemand } from "../../assemble/on-demand/index.js";
import type { Way } from "../../assemble/way.js";
import { extension } from "./extension.js";

const db = await PGlite.create();
const database = new PGLiteSocketServer({ db, port: 0, maxConnections: 100 });
await database.start();
process.env.DATABASE_URL = `postgresql://postgres@${database.getServerConn()}/postgres`;
process.env.QUE_DEPLOYMENT = deploymentRoot(
  join(import.meta.dirname, "../../../../tests/integration/mount/fixtures"),
  "two",
);
const host = await import("./harness.js");
const threads = createStore();
/** A reader of pi's tables, beside the host's own connection. */
const pi = new pg.Client({ connectionString: process.env.DATABASE_URL });
await pi.connect();

after(async () => {
  await pi.end();
  await database.stop();
  await db.close();
});

/** What get-order fails with in this turn, for an order id below zero; with none, it answers. */
let failure: string | undefined;

/** What a failing get-order waits for before it fails, if anything. */
let held: Promise<void> | undefined;
/** How many failing calls go before the one that waits for `held`. */
let heldAfter = 0;

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
        if (id < 0 && failure !== undefined) {
          if (heldAfter-- <= 0) await held;
          throw new OpFailed(failure);
        }
        return { id };
      },
    },
  ],
});
const catalog: Catalog = [
  {
    plugin: {
      definition: shop,
      skills: [],
      card: cardOf({ definition: shop, cases: [] }),
    },
  },
];

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
host.models.setProvider(faux.provider);

/** The model config the host's runs are on: faux's model, under Fireworks' id. */
const small: Model = {
  name: "small",
  type: "model",
  description: "A model of a test.",
  id: "fireworks:small-model",
  window: 1_000_000,
  maxTokens: 8_000,
};

type Args = Parameters<typeof fauxToolCall>[1];
type Result = { id: string; isError: boolean; text: string };

const textOf = (content: readonly { type: string; text?: string }[]) =>
  content.map((block) => block.text ?? "").join("");

/** A chat on a new conversation with que's extension of the shop, for one user, on the agent's way of loading `way`. */
async function chat(way: Way = eager) {
  // The extension takes its name where it is installed: here, one Harness per chat.
  const que = {
    ...extension(
      catalog,
      door(async () => undefined),
      "ana",
      way,
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
   * (else `c<i>`); with `tool`, the calls are to that tool. get-order
   * fails with `fails`, and answers when `fails` is given as undefined.
   * Each tool result of the turn, the text of its last
   * message (an answer or a tool result), and how many times the model was
   * called.
   */
  async function turn(
    calls: (Args | Args[])[],
    given: { answer?: string; fails?: string | undefined; tool?: string } = {},
  ) {
    const answer = given.answer ?? "Done.";
    const tool = given.tool ?? "shop-get-order";
    failure = "fails" in given ? given.fails : "no such order";
    let modelCalls = 0;
    faux.setResponses([
      ...calls.map((args, i) => () => {
        modelCalls++;
        return fauxAssistantMessage(
          Array.isArray(args)
            ? args.map((one, j) =>
                fauxToolCall(tool, one, { id: `c${i}.${j}` }),
              )
            : fauxToolCall(tool, args, { id: `c${i}` }),
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
  "given an on-demand config and a model that loads an op the shop does not hold five times the same way, when the third load fails, then the run ends with no other model call, on a message that names the load and its error",
  { timeout },
  async () => {
    const c = await chat(onDemand);
    try {
      const nope = { plugin: "shop", operation: "shop-nope" };
      const { results, last, modelCalls } = await c.turn(
        [nope, nope, nope, nope, nope],
        { tool: "load_operation" },
      );
      assert.equal(results.length, 3);
      assert.equal(modelCalls, 3);
      assert.match(
        last,
        /load_operation\(\{"plugin":"shop","operation":"shop-nope"\}\)/,
      );
      assert.match(last, /failed 3 times in a row/);
      // The load's error names the ops the shop holds.
      assert.match(last, /shop-get-order/);
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

/** The model's responses: one for each item of `calls`, a list of arguments a call for each (`c<i>.<j>`), then `answer`. How many were asked for, so far. */
function script(calls: (Args | Args[])[], answer = "Done.") {
  const asked = { count: 0 };
  faux.setResponses([
    ...calls.map((args, i) => () => {
      asked.count++;
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
      asked.count++;
      return fauxAssistantMessage(fauxText(answer));
    },
  ]);
  return asked;
}

/** The status of pi's submission of the run `runId`'s input: queued, placed or done. */
async function statusOf(runId: string) {
  const { rows } = await pi.query<{ status: string }>(
    "SELECT status FROM pi.submissions WHERE request_id LIKE '%' || $1 || '%'",
    [runId],
  );
  return rows.map((row) => row.status).join();
}

/**
 * Whether the run `runId`'s input is queued in its conversation's inbox,
 * by pi's submission of it, within 5 seconds.
 */
async function queuedIn(runId: string) {
  for (let waited = 0; waited < 5_000; waited += 20) {
    const { rows } = await pi.query<{ status: string }>(
      "SELECT status FROM pi.submissions WHERE request_id LIKE '%' || $1 || '%'",
      [runId],
    );
    if (rows.some((row) => row.status.includes("queued"))) return true;
    await new Promise((wait) => setTimeout(wait, 20));
  }
  return false;
}

/** A thread of Ana's, and the ids of the messages its client knows, as the AG-UI events of its runs give them. */
async function hostThread() {
  const { id } = await threads.make("ana");
  const known: string[] = [];

  /**
   * One run through the host: the user's message, with the messages the
   * client knows before it. Each tool result of the run, by its call, the
   * text of its answers, and its error, if any. `seen` gets each event.
   */
  async function send(seen?: (event: AGUIEvent) => void, runId = randomUUID()) {
    const last = { id: randomUUID(), content: "Get order -1." };
    const before = [...known];
    known.push(last.id);
    const results = new Map<string, string>();
    const texts: string[] = [];
    const { error } = await host.run(
      id,
      small,
      {
        catalog,
        user: "ana",
        agent: "test",
        prompt: {},
        way: eager,
        // Never summarized: the guard's cases are short chats.
        summarize: false,
      },
      { runId, before, last },
      async (event) => {
        // A call's id is not one: faux's call ids are the same in each run.
        if (event.type === EventType.TOOL_CALL_START)
          known.push(event.parentMessageId ?? "");
        if (event.type === EventType.TEXT_MESSAGE_START)
          known.push(event.messageId);
        if (event.type === EventType.TOOL_CALL_RESULT)
          results.set(
            event.toolCallId,
            typeof event.content === "string"
              ? event.content
              : JSON.stringify(event.content),
          );
        if (event.type === EventType.TEXT_MESSAGE_CONTENT)
          texts.push(event.delta);
        seen?.(event);
      },
    );
    return { results, text: texts.join(""), error };
  }
  /** Whether the thread holds the message `messageId`, within 5 seconds: its client can then send the next one after it. */
  async function holds(messageId: string) {
    for (let waited = 0; waited < 5_000; waited += 20) {
      if ((await host.messages(id)).some((m) => m.id === messageId))
        return true;
      await new Promise((wait) => setTimeout(wait, 20));
    }
    return false;
  }

  return { id, send, holds };
}

/**
 * A run of six responses, each with the stuck call beside `sibling`, then
 * "Done.". The guard stops the run on the third round: its stuck call's
 * result names the call and the error, and the model is called once more
 * at most, never as far as the answer.
 */
async function mixedRounds(sibling: Args) {
  failure = "no such order";
  const asked = script(Array.from({ length: 6 }, () => [failing, sibling]));
  const { results, text } = await (await hostThread()).send();
  assert.ok(
    asked.count <= 4,
    `the model was called ${asked.count} times, past the stop round and one more`,
  );
  assert.notEqual(text, "Done.");
  const stuck = results.get("c2.0");
  assert.match(String(stuck), /shop-get-order\(\{"id":-1\}\)/);
  assert.match(String(stuck), /failed 3 times in a row/);
  assert.match(String(stuck), /no such order/);
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
  "given a saved chat in which the call failed twice, and a run whose one call fails the third time, when the user's next message is queued behind it on the same thread, then the guard stops the run and the queued message is still answered",
  { timeout },
  async () => {
    const thread = await hostThread();
    failure = "no such order";
    for (let i = 0; i < 2; i++) {
      script([failing], "That did not work.");
      await thread.send();
    }
    // The stuck call fails only once pi holds the next message queued behind the run.
    let release!: () => void;
    held = new Promise<void>((go) => (release = go));
    const asked = script([failing], "Done.");
    const nextRun = randomUUID();
    let queued: ReturnType<typeof thread.send> | undefined;
    let wasQueued: Promise<boolean> | undefined;
    const stopped = await thread.send((event) => {
      if (event.type === EventType.TOOL_CALL_START && !wasQueued) {
        // The client sends its next message once the thread holds the call's message, so it goes on the same conversation.
        wasQueued = (async () => {
          try {
            if (!(await thread.holds(event.parentMessageId ?? "")))
              return false;
            queued = thread.send(undefined, nextRun);
            return await queuedIn(nextRun);
          } finally {
            release();
          }
        })();
      }
    });
    held = undefined;
    assert.equal(
      await wasQueued,
      true,
      "the next message was not queued behind the run",
    );
    assert.match(String(stopped.results.get("c0")), /failed 3 times in a row/);
    const next = await Promise.race([
      queued,
      new Promise<undefined>((none) =>
        setTimeout(() => none(undefined), 5_000),
      ),
    ]);
    assert.equal(next?.text, "Done.", "the queued message was not answered");
    assert.equal(asked.count, 2);
  },
);

test(
  "given a run whose every response has the stuck call beside a call that answers, and the user's next message queued behind it on the same thread, when the host stops the run on the third round, then that message is still queued, not withdrawn",
  { timeout },
  async () => {
    const thread = await hostThread();
    failure = "no such order";
    // The third stuck call fails only once pi holds the next message queued behind the run.
    let release!: () => void;
    held = new Promise<void>((go) => (release = go));
    heldAfter = 2;
    script(Array.from({ length: 6 }, () => [failing, { id: 4 }]));
    const nextRun = randomUUID();
    let wasQueued: Promise<boolean> | undefined;
    const stopped = await thread.send((event) => {
      if (
        event.type === EventType.TOOL_CALL_START &&
        event.toolCallId === "c2.0" &&
        !wasQueued
      )
        wasQueued = (async () => {
          try {
            if (!(await thread.holds(event.parentMessageId ?? "")))
              return false;
            void thread.send(undefined, nextRun);
            return await queuedIn(nextRun);
          } finally {
            release();
          }
        })();
    });
    held = undefined;
    heldAfter = 0;
    assert.equal(
      await wasQueued,
      true,
      "the next message was not queued behind the run",
    );
    assert.match(
      String(stopped.results.get("c2.0")),
      /failed 3 times in a row/,
    );
    const status = await statusOf(nextRun);
    // The thread's work ends here, so the queued run takes none of a later case's model responses.
    await host.stop(thread.id);
    assert.equal(status, "queued");
  },
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
