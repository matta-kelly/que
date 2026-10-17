/**
 * The model a run is built with: the one the run names, then the one its
 * agent config names. que has no model of its own.
 */

import { initChatModel } from "langchain";
import {
  providerModelOf,
  providerOf,
  type AgentDefinition,
  type MountedModel,
} from "@que/core";
import { ChatBeam } from "./beam.js";

export function modelFor(
  models: MountedModel[],
  config: AgentDefinition,
  named: unknown,
): MountedModel {
  const name = named ?? config.model;
  const model = models.find((m) => m.name === name);
  if (model) return model;
  // No fall back to the first: a run on the wrong model would look like a run on the right one.
  throw new Error(
    `no model ${JSON.stringify(name)}. Models: ${models.map((m) => m.name).join(", ")}`,
  );
}

/**
 * The framework's model for a config: its provider's model, with the most it gives in one reply.
 * It reads no field of the run: left to itself the framework takes `configurable.model`,
 * the name of a model config, as the provider's model. Beam has no package of the framework's:
 * its model is que's own (./beam.ts). The config's effort goes out as `reasoning_effort`.
 */
export const chatModel = async (model: MountedModel) =>
  providerOf(model) === "beam"
    ? new ChatBeam({
        model: providerModelOf(model),
        maxTokens: model.maxTokens,
        effort: model.effort,
      })
    : initChatModel(model.id, {
        maxTokens: model.maxTokens,
        // As ChatBeam sends it: the framework sends its own `reasoning` only for the names of OpenAI's reasoning models.
        ...(model.effort && {
          modelKwargs: { reasoning_effort: model.effort },
        }),
        configurableFields: [],
      });
