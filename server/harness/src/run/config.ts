/**
 * The config a run is built from: the one it names, out of the ones the
 * deployment lists. A run that names none gets the first, so the chat is the
 * first one listed.
 */

import type { AgentDefinition } from "@que/core";

/** What a run is built from when the deployment lists no config. */
export const OWN_CHOICES: AgentDefinition = { name: "default" };

export function configFor(
  agents: AgentDefinition[],
  name: unknown,
): AgentDefinition {
  if (name === undefined) return agents[0] ?? OWN_CHOICES;
  const named = agents.find((agent) => agent.name === name);
  if (named) return named;
  // No fall back to the first: a run under the wrong config would look like a run under the right one.
  throw new Error(
    `no agent ${JSON.stringify(name)}. ${
      agents.length
        ? `Agents: ${agents.map((agent) => agent.name).join(", ")}`
        : "This deployment lists no agents"
    }`,
  );
}
