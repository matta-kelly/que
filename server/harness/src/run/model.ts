/**
 * The model the agent is built with: the one the deployment's `agent` names,
 * then MODEL from the environment, then the one named here.
 */

import type { AgentDefinition } from "@que/core";

export const DEFAULT_MODEL =
  "fireworks:accounts/fireworks/models/deepseek-v4p1-flash";

export function modelFor(
  agent: AgentDefinition,
  env: { MODEL?: string },
): string {
  return agent.model ?? env.MODEL ?? DEFAULT_MODEL;
}
