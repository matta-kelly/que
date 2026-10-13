/**
 * The model the agent is built with: the one the config of the run names,
 * then MODEL from the environment, then the one named here.
 */

import type { AgentDefinition } from "@que/core";

export const DEFAULT_MODEL =
  "fireworks:accounts/fireworks/models/deepseek-v4p1-flash";

export function modelFor(
  agent: Pick<AgentDefinition, "model">,
  env: { MODEL?: string },
): string {
  return agent.model ?? env.MODEL ?? DEFAULT_MODEL;
}
