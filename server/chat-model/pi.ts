/**
 * The pi model maker: the pi-ai model for a model config, Fireworks on its
 * Chat Completions endpoint. What is true of a model (its window, its price) is que's, from the config.
 */

import type { Model as PiModel } from "@earendil-works/pi-ai";
import { providerModelOf, type Model } from "@mku1tra/que-harness";

const FIREWORKS = "https://api.fireworks.ai/inference/v1";

export const piModel = (model: Model): PiModel<"openai-completions"> => ({
  id: providerModelOf(model),
  name: model.name,
  api: "openai-completions",
  provider: "fireworks",
  baseUrl: FIREWORKS,
  // que sends no thinking level, so pi-ai asks for no reasoning: the model reasons as its provider sets it.
  reasoning: false,
  input: ["text"],
  cost: {
    input: model.price?.input ?? 0,
    output: model.price?.output ?? 0,
    cacheRead: model.price?.cachedInput ?? model.price?.input ?? 0,
    cacheWrite: 0,
  },
  contextWindow: model.window,
  maxTokens: model.maxTokens,
});
