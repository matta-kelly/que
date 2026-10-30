import { test } from "node:test";
import assert from "node:assert/strict";
import { createModels } from "@earendil-works/pi-ai";
import { fireworks, piModel } from "./index.js";

// A model config as a deployment gives it: its id, its window and the most it gives in one reply.
const glm = {
  name: "glm",
  type: "model" as const,
  description: "A model of a test.",
  id: "fireworks:accounts/fireworks/models/glm-5p3-flash",
  window: 202_752,
  maxTokens: 16_384,
};
const small = {
  name: "small",
  type: "model" as const,
  description: "A model of a test.",
  id: "fireworks:small-model",
  window: 64_000,
  maxTokens: 8_000,
  price: { input: 0.5, output: 1 },
};

/** What a pi-ai model says of where it runs: its provider, its api, its id, its base URL and its window. */
const where = (made: ReturnType<typeof piModel>) => ({
  provider: made.provider,
  api: made.api,
  id: made.id,
  baseUrl: made.baseUrl,
  contextWindow: made.contextWindow,
});

test("the pi model for a Fireworks config is Fireworks' Chat Completions model, with the config's model id and window", () => {
  assert.deepEqual(where(piModel(glm)), {
    provider: "fireworks",
    api: "openai-completions",
    id: "accounts/fireworks/models/glm-5p3-flash",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    contextWindow: 202_752,
  });
  assert.deepEqual(where(piModel(small)), {
    provider: "fireworks",
    api: "openai-completions",
    id: "small-model",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    contextWindow: 64_000,
  });
});

test("the Fireworks provider put on pi's models is Fireworks, and serves each config's model on Chat Completions at Fireworks' base URL", () => {
  const models = createModels();
  models.setProvider(fireworks([glm, small]));

  const provider = models.getProvider("fireworks");
  assert.deepEqual(
    { id: provider?.id, name: provider?.name },
    { id: "fireworks", name: "Fireworks" },
  );
  assert.deepEqual(
    models.getModels("fireworks").map((m) => ({
      provider: m.provider,
      api: m.api,
      id: m.id,
      baseUrl: m.baseUrl,
    })),
    [
      {
        provider: "fireworks",
        api: "openai-completions",
        id: "accounts/fireworks/models/glm-5p3-flash",
        baseUrl: "https://api.fireworks.ai/inference/v1",
      },
      {
        provider: "fireworks",
        api: "openai-completions",
        id: "small-model",
        baseUrl: "https://api.fireworks.ai/inference/v1",
      },
    ],
  );
});

/** A `fetch` that answers each request with one streamed chat completion, and keeps each request's body. */
function answering() {
  const sent: Record<string, unknown>[] = [];
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    sent.push(body);
    const chunk = (delta: object, finish: string | null) =>
      `data: ${JSON.stringify({
        id: `chatcmpl-${sent.length}`,
        object: "chat.completion.chunk",
        created: 1_791_878_400,
        model: body.model,
        choices: [{ index: 0, delta, finish_reason: finish }],
      })}\n\n`;
    return new Response(
      chunk({ role: "assistant", content: "It is so." }, null) +
        chunk({}, "stop") +
        "data: [DONE]\n\n",
      { headers: { "content-type": "text/event-stream" } },
    );
  };
  return { fetch, sent };
}

test("a config's effort is sent to Fireworks as reasoning_effort, and a config with no effort sends none", async () => {
  // The provider is made with a key, and calls the global fetch.
  process.env.FIREWORKS_API_KEY ??= "none";
  const configs = [
    { ...glm, effort: "low" },
    { ...small, effort: "high" },
    { ...small, name: "plain", id: "fireworks:plain-model" },
  ];
  const models = createModels();
  models.setProvider(fireworks(configs));
  const { fetch, sent } = answering();
  const send = globalThis.fetch;
  globalThis.fetch = fetch;
  try {
    for (const config of configs)
      // As a run and the judge call it: with the config's model, and no thinking level of their own.
      await models.completeSimple(piModel(config), {
        messages: [{ role: "user", content: "Hello.", timestamp: Date.now() }],
      });
  } finally {
    globalThis.fetch = send;
  }
  assert.deepEqual(
    sent.map((body) => ({
      model: body.model,
      // null: the request has no reasoning_effort.
      reasoning_effort: Object.hasOwn(body, "reasoning_effort")
        ? body.reasoning_effort
        : null,
    })),
    [
      {
        model: "accounts/fireworks/models/glm-5p3-flash",
        reasoning_effort: "low",
      },
      { model: "small-model", reasoning_effort: "high" },
      { model: "plain-model", reasoning_effort: null },
    ],
  );
});
