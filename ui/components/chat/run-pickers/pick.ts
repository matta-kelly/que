// The pick of a chat: the agent and the model its runs take. Kept on the
// thread's record on que's server, beside its title. A field that is not set,
// or null, follows the deployment.

import type { Deployment } from "../../../lib/que-api.ts";

export type RunPick = { agent?: string | null; model?: string | null };

/** What the chat runs on, for the pickers to show. */
export type ResolvedPick = {
  agent: string | undefined;
  model: string | undefined;
};

/** The pick of an agent. It clears the picked model, so the model follows the agent. */
export const agentPick = (agent: string): RunPick => ({ agent, model: null });

/**
 * What a pick comes to on a deployment. A name the deployment does not list is
 * dropped, and follows the deployment. While the deployment is not known the
 * pick is shown as it is.
 */
export function resolve(
  pick: RunPick,
  deployment: Deployment | undefined,
): ResolvedPick {
  if (!deployment)
    return { agent: pick.agent || undefined, model: pick.model || undefined };
  const agent =
    deployment.agents.find((a) => a.name === pick.agent) ??
    deployment.agents[0];
  const listed = deployment.models.some((model) => model.name === pick.model);
  return {
    agent: agent?.name,
    model: listed ? pick.model! : agent?.model,
  };
}
