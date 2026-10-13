/**
 * The model a run is built with: the one the run names, then the one its
 * agent config names, then the first the deployment lists, then que's own.
 */

import { initChatModel } from "langchain";
import type { AgentDefinition, MountedModel } from "@que/core";

/**
 * What a run is built with on a deployment that lists no model: `server/models/glm-flash.ts`,
 * with its facts written out, since no mount fills them. No reader shows its price: the
 * deployment route gives the models a deployment lists.
 */
export const OWN_MODEL: MountedModel = {
  name: "glm-flash",
  id: "fireworks:accounts/fireworks/models/glm-5p3-flash",
  maxTokens: 131_072,
  window: 1_048_576,
  price: { input: 0.15, output: 0.5, cachedInput: 0.03 },
};

export function modelFor(
  models: MountedModel[],
  config: AgentDefinition,
  named: unknown,
): MountedModel {
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
export const chatModel = (model: MountedModel) =>
  initChatModel(model.id, {
    maxTokens: model.maxTokens,
    configurableFields: [],
  });
