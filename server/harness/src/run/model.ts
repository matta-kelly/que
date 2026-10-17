/**
 * The model a run is built with: the one the run names, then the one its
 * agent config names, then the first the deployment lists. que has no model
 * of its own: a deployment lists at least one.
 */

import { initChatModel } from "langchain";
import type { AgentDefinition, MountedModel } from "@que/core";

export function modelFor(
  models: MountedModel[],
  config: AgentDefinition,
  named: unknown,
): MountedModel {
  const name = named ?? config.model;
  const model =
    name === undefined ? models[0] : models.find((m) => m.name === name);
  if (model) return model;
  // No fall back to the first: a run on the wrong model would look like a run on the right one.
  throw new Error(
    `no model${name === undefined ? "" : ` ${JSON.stringify(name)}`}. ${
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
