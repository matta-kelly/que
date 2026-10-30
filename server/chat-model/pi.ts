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

const LEVELS: readonly string[] = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] satisfies ThinkingLevel[];

// An effort that is a pi-ai level is its own level. Another word goes on "medium", a level every model that reasons
// has, so pi-ai keeps it (clampThinkingLevel); the model's map sends the word as it is.
const levelFor = (effort: string): ThinkingLevel =>
  LEVELS.includes(effort) ? (effort as ThinkingLevel) : "medium";

export const piModel = (model: Model): PiModel<"openai-completions"> => ({
  id: providerModelOf(model),
  name: model.name,
  api: "openai-completions",
  provider: "fireworks",
  baseUrl: FIREWORKS,
  // A config with an effort reasons: a call at its level sends the effort, as the map gives it, as reasoning_effort.
  // One with none passes no level, and the model reasons as its provider sets it.
  reasoning: model.effort !== undefined,
  ...(model.effort !== undefined && {
    thinkingLevelMap: { [levelFor(model.effort)]: model.effort },
  }),
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
export const levelOf = (model: Model): ThinkingLevel | undefined =>
  model.effort === undefined ? undefined : levelFor(model.effort);

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
