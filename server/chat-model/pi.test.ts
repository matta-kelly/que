import { test } from "node:test";
import assert from "node:assert/strict";
import { piModel } from "./index.js";

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
