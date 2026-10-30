/**
 * The pi model maker: the pi-ai model for a model config, Fireworks on its
 * Chat Completions endpoint, and the provider that serves those models. What
 * is true of a model (its window, its price) is que's, from the config.
 */

import {
  createProvider,
  envApiKeyAuth,
  type Model as PiModel,
  type ThinkingLevel,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { providerModelOf, providerOf, type Model } from "@mku1tra/que-harness";

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

/**
 * The thinking level a call on the config's model passes, so pi-ai sends the config's `effort` as
 * `reasoning_effort`. None for a config with no effort: no level is passed, and none is sent.
 */
// A stub of F12's interface: its body is da-hammer's.
export const levelOf: (model: Model) => ThinkingLevel | undefined = () =>
  undefined;

/** Fireworks, with the deployment's Fireworks models, each as its config gives it. */
export const fireworks = (models: Model[]) =>
  createProvider({
    id: "fireworks",
    name: "Fireworks",
    auth: {
      apiKey: envApiKeyAuth("Fireworks API key", ["FIREWORKS_API_KEY"]),
    },
    models: models.filter((m) => providerOf(m) === "fireworks").map(piModel),
    api: openAICompletionsApi(),
  });
