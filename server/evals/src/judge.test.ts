/**
 * The judge: its question and its reading of a reply, which have no model in
 * them, and its call, on pi-ai's scripted provider (`faux`) under Fireworks'
 * provider id, so no model is called. Its own model, by default, is the pi-ai
 * model a run on its config gets: a request to Fireworks, answered here.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createModels, type Context } from "@earendil-works/pi-ai";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxThinking,
} from "@earendil-works/pi-ai/providers/faux";
import { completion } from "../fixtures/provider-stand-in.js";
import { judge, judged, question, verdictOf } from "./judge.js";

const byCustomer = {
  plugin: "shop",
  name: "find-order-by-customer",
  type: "case" as const,
  description: "A behaviour of its capability.",
  capability: "find-order",
  input: "Where is the order of Ada?",
  start: "Ada has one open order.",
  good: "The answer gives the state of the order of Ada.",
};
const notAsked = {
  plugin: "shop",
  name: "find-order-not-asked",
  type: "case" as const,
  description: "A behaviour of its capability.",
  capability: "find-order",
  input: "What can you do?",
  start: "Any.",
  good: "No operation is called.",
};
const small = {
  name: "small",
  type: "model" as const,
  description: "A model of a test.",
  id: "fireworks:accounts/fireworks/models/small-model",
  window: 128_000,
  maxTokens: 8_000,
};

const open = {
  steps: [
    {
      kind: "call" as const,
      name: "shop-find-orders",
      type: "loop" as const,
      description: "A loop of a test.",
      args: { customer: "Ada" },
    },
    {
      kind: "result" as const,
      name: "shop-find-orders",
      text: '[{"id":12,"state":"open"}]',
    },
  ],
  answer: "Order 12 of Ada is open.",
};
const orders = { steps: [], answer: "I can find the shop's orders." };

test("the judge is asked for each run that finished, and for no other", async () => {
  const asked: unknown[] = [];
  const verdict = { pass: true, reason: "It is so." };
  const outcomes = await judged(
    [
      { case: byCustomer, agent: "chat", record: open },
      { case: byCustomer, agent: "lean", error: "it stopped" },
      {
        case: byCustomer,
        agent: "notes-only",
        skipped: "notes-only does not have shop",
      },
      { case: notAsked, agent: "chat", record: orders },
    ],
    (c, record) => {
      asked.push({ case: c, record });
      return Promise.resolve(verdict);
    },
  );
  assert.deepEqual(asked, [
    { case: byCustomer, record: open },
    { case: notAsked, record: orders },
  ]);
  assert.deepEqual(outcomes, [
    { case: byCustomer, agent: "chat", record: open, verdict },
    { case: byCustomer, agent: "lean", error: "it stopped" },
    {
      case: byCustomer,
      agent: "notes-only",
      skipped: "notes-only does not have shop",
    },
    { case: notAsked, agent: "chat", record: orders, verdict },
  ]);
});

test("the question has the case, each call, each result and the answer", () => {
  const text = question(byCustomer, open);
  assert.ok(text.includes("Where is the order of Ada?"));
  assert.ok(text.includes("Ada has one open order."));
  assert.ok(text.includes("The answer gives the state of the order of Ada."));
  assert.ok(text.includes('shop-find-orders {"customer":"Ada"}'));
  assert.ok(text.includes('[{"id":12,"state":"open"}]'));
  assert.ok(text.includes("Order 12 of Ada is open."));
});

test("the question cuts a long result to 2,000 characters, and marks it", () => {
  const text = question(byCustomer, {
    steps: [
      { kind: "result", name: "shop-find-orders", text: "x".repeat(2_500) },
    ],
    answer: "y".repeat(2_500),
  });
  assert.ok(text.includes(`${"x".repeat(2_000)} (cut)`));
  assert.ok(!text.includes("x".repeat(2_001)));
  // The answer is given whole.
  assert.ok(text.includes("y".repeat(2_500)));
});

test("a reply that ends with a verdict of yes is a pass, of no is a fail, and the reason is the rest", () => {
  assert.deepEqual(
    verdictOf(
      "The answer says the order is open.\nIt is order 12.\nVERDICT: yes",
    ),
    {
      pass: true,
      reason: "The answer says the order is open.\nIt is order 12.",
    },
  );
  // The line is read the same in another case, and with spaces around it.
  assert.deepEqual(verdictOf("The answer names no order.\n  verdict: NO \n"), {
    pass: false,
    reason: "The answer names no order.",
  });
});

test("a reply with no verdict line is no verdict", () => {
  assert.deepEqual(verdictOf("The answer says the order is open."), {
    none: "the reply has no VERDICT line",
  });
});

/** pi-ai's models, with the scripted provider in the place of Fireworks, serving `small`'s model. */
function scripted() {
  const faux = fauxProvider({
    provider: "fireworks",
    models: [{ id: "accounts/fireworks/models/small-model" }],
  });
  const models = createModels();
  models.setProvider(faux.provider);
  return { faux, models };
}

/** The text of each user message the model was sent. */
const said = (context: Context) =>
  context.messages.flatMap((m) =>
    m.role !== "user"
      ? []
      : typeof m.content === "string"
        ? [m.content]
        : m.content.flatMap((c) => (c.type === "text" ? [c.text] : [])),
  );

test("the model is sent the question of the case and the run, as the user's message", async () => {
  const { faux, models } = scripted();
  const sent: string[][] = [];
  faux.setResponses(
    [byCustomer, notAsked].map(() => (context: Context) => {
      sent.push(said(context));
      return fauxAssistantMessage("It is so.\nVERDICT: yes");
    }),
  );
  const ask = judge(small, models);
  await ask(byCustomer, open);
  await ask(notAsked, orders);
  assert.deepEqual(sent, [
    [question(byCustomer, open)],
    [question(notAsked, orders)],
  ]);
});

test("a call to the model that fails is no verdict, and the next run is judged", async () => {
  // pi-ai does not throw a failed call: its message ends with stopReason "error", and the error's message.
  const { faux, models } = scripted();
  faux.setResponses([
    fauxAssistantMessage([], {
      stopReason: "error",
      errorMessage: "429 too many requests",
    }),
    fauxAssistantMessage("The answer says the order is open.\nVERDICT: yes"),
    fauxAssistantMessage([], {
      stopReason: "error",
      errorMessage: "401 Unauthorized: the API key is not valid.",
    }),
    fauxAssistantMessage("The answer names no order.\nVERDICT: no"),
  ]);
  const ask = judge(small, models);
  assert.deepEqual(
    [
      await ask(byCustomer, open),
      await ask(notAsked, orders),
      await ask(byCustomer, open),
      await ask(notAsked, orders),
    ],
    [
      { none: "the call to the model failed: 429 too many requests" },
      { pass: true, reason: "The answer says the order is open." },
      {
        none: "the call to the model failed: 401 Unauthorized: the API key is not valid.",
      },
      { pass: false, reason: "The answer names no order." },
    ],
  );
});

test("the verdict is read from the reply's text, not from what the model thought", async () => {
  const { faux, models } = scripted();
  faux.setResponses([
    fauxAssistantMessage([
      fauxThinking("The order may be closed.\nVERDICT: no"),
      fauxText("The answer says the order is open.\nVERDICT: yes"),
    ]),
    fauxAssistantMessage([
      fauxThinking("The answer is fine.\nVERDICT: yes"),
      fauxText("The answer names no order.\nVERDICT: no"),
    ]),
  ]);
  const ask = judge(small, models);
  assert.deepEqual(
    [await ask(byCustomer, open), await ask(notAsked, orders)],
    [
      { pass: true, reason: "The answer says the order is open." },
      { pass: false, reason: "The answer names no order." },
    ],
  );
});

/** A `fetch` that answers each request with one streamed chat completion of `text`, and keeps each request. */
function answering(text: string) {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const fetch: typeof globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body));
    sent.push({ url: String(url), body });
    return new Response(completion(sent.length, body.model, text), {
      headers: { "content-type": "text/event-stream" },
    });
  };
  return { fetch, sent };
}

test("the judge's own model is a run's: Fireworks' Chat Completions, with each config's model id and the most it gives in one reply", async () => {
  // The provider is made with a key, and calls the global fetch.
  process.env.FIREWORKS_API_KEY ??= "none";
  const glm = {
    name: "glm",
    type: "model" as const,
    description: "A model of a test.",
    id: "fireworks:accounts/fireworks/models/glm-5p3-flash",
    window: 202_752,
    maxTokens: 16_384,
  };
  const send = globalThis.fetch;
  for (const [model, reply, verdict] of [
    [
      small,
      "The answer says the order is open.\nVERDICT: yes",
      { pass: true, reason: "The answer says the order is open." },
    ],
    [
      glm,
      "The answer names no order.\nVERDICT: no",
      { pass: false, reason: "The answer names no order." },
    ],
  ] as const) {
    const { fetch, sent } = answering(reply);
    globalThis.fetch = fetch;
    try {
      assert.deepEqual(await judge(model)(byCustomer, open), verdict);
    } finally {
      globalThis.fetch = send;
    }
    assert.equal(sent.length, 1);
    assert.equal(
      sent[0].url,
      "https://api.fireworks.ai/inference/v1/chat/completions",
    );
    assert.equal(sent[0].body.model, model.id.slice(model.id.indexOf(":") + 1));
    assert.equal(sent[0].body.max_completion_tokens, model.maxTokens);
  }
});
