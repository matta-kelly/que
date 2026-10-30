// The pick of a chat: the agent and the model its runs take. Kept on the
// thread's record on que's server, beside its title. A field that is not set,
// or null, follows the deployment.

import type { Deployment } from "../../../lib/que-api.ts";

export type RunPick = { agent?: string | null; model?: string | null };

export type ResolvedPick = {
  /** What the chat runs on, for the pickers to show. */
  agent: string | undefined;
  model: string | undefined;
  /** What a run is sent, as its `configurable`. */
  send: { agent?: string; model?: string };
};

/** The pick of an agent. It clears the picked model, so the model follows the agent. */
export const agentPick = (agent: string): RunPick => ({ agent, model: null });

/**
 * What a pick comes to on a deployment. A name the deployment does not list is
 * dropped, so the run is sent nothing for it and follows the deployment. While
 * the deployment is not known the pick is sent as it is: the server fails a run
 * that names what it does not have.
 */
export function resolve(
  pick: RunPick,
  deployment: Deployment | undefined,
): ResolvedPick {
  const send: ResolvedPick["send"] = {};
  if (!deployment) {
    if (pick.agent) send.agent = pick.agent;
    if (pick.model) send.model = pick.model;
    return { agent: send.agent, model: send.model, send };
  }
  const picked = deployment.agents.find((agent) => agent.name === pick.agent);
  if (picked) send.agent = picked.name;
  if (deployment.models.some((model) => model.name === pick.model))
    send.model = pick.model!;
  const agent = picked ?? deployment.agents[0];
  return {
    agent: agent?.name,
    model: send.model ?? agent?.model,
    send,
  };
}
