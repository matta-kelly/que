/**
 * What a deployment lists, for the one that picks: its agents and its models,
 * by name. Nothing here is a secret or a prompt: no provider id, no
 * instructions, no package names.
 */

import type {
  AgentDefinition,
  LoopDefinition,
  ModelPrice,
  MountedModel,
} from "@que/core";
import { loopFor } from "./loop.js";
import { modelFor } from "./model.js";

export type DeploymentInfo = {
  /**
   * In the order listed. A run that names none gets the first. `summarizeAt` is the share of the
   * model's window past which the agent sends the old part of a chat as a summary. An agent that
   * does not summarize has none.
   */
  agents: { name: string; model: string; summarizeAt?: number }[];
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
  loops: LoopDefinition[] = [],
): DeploymentInfo {
  return {
    // `model` is the one a run of the agent gets when the run names none.
    agents: agents.map((agent) => {
      const loop = loopFor(loops, agent);
      // `summarize` acts on the deep engine only: on `plain` no chat is summarized.
      const summarizes = loop.engine === "deepagents" && loop.summarize;
      return {
        name: agent.name,
        model: modelFor(models, agent, undefined).name,
        ...(summarizes && { summarizeAt: summarizes.at }),
      };
    }),
    models: models.map(({ name, window, maxTokens, price }) => ({
      name,
      window,
      maxTokens,
      price,
    })),
  };
}
