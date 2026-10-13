/**
 * The model a run is built with: the one the run names, then the one its
 * agent config names, then the first the deployment lists, then que's own.
 */

import { initChatModel } from "langchain";
import type { AgentDefinition, ModelDefinition } from "@que/core";

/** What a run is built with on a deployment that lists no model. The same as `server/models/glm-flash.ts`. */
export const OWN_MODEL: ModelDefinition = {
  name: "glm-flash",
  id: "fireworks:accounts/fireworks/models/glm-5p3-flash",
  window: 1_040_000,
  maxTokens: 131_072,
};

export function modelFor(
  models: ModelDefinition[],
  config: AgentDefinition,
  named: unknown,
): ModelDefinition {
  const name = named ?? config.model;
  if (name === undefined) return models[0] ?? OWN_MODEL;
  const model = models.find((m) => m.name === name);
  if (model) return model;
  // No fall back to the first: a run on the wrong model would look like a run on the right one.
  throw new Error(
    `no model ${JSON.stringify(name)}. ${
      models.length
        ? `Models: ${models.map((m) => m.name).join(", ")}`
        : "This deployment lists no models"
    }`,
  );
}

/**
 * The framework's model for a config: its provider's model, with the most it gives in one reply.
 * It reads no field of the run: left to itself the framework takes `configurable.model`,
 * the name of a model config, as the provider's model.
 */
export const chatModel = (model: ModelDefinition) =>
  initChatModel(model.id, {
    maxTokens: model.maxTokens,
    configurableFields: [],
  });
