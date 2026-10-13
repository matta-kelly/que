/**
 * What a deployment lists, for the one that picks: its agents and its models,
 * by name. Nothing here is a secret or a prompt: no provider id, no
 * instructions, no package names.
 */

import type { AgentDefinition, ModelPrice, MountedModel } from "@que/core";
import { modelFor } from "./model.js";

export type DeploymentInfo = {
  /** In the order listed. A run that names none gets the first. */
  agents: { name: string; model: string }[];
  /** `price` is in dollars for one million tokens. */
  models: {
    name: string;
    window: number;
    maxTokens: number;
    price: ModelPrice;
  }[];
};

export function deploymentInfo(
  agents: AgentDefinition[],
  models: MountedModel[],
): DeploymentInfo {
  return {
    // The model a run of the agent gets when the run names none.
    agents: agents.map((agent) => ({
      name: agent.name,
      model: modelFor(models, agent, undefined).name,
    })),
    models: models.map(({ name, window, maxTokens, price }) => ({
      name,
      window,
      maxTokens,
      price,
    })),
  };
}
