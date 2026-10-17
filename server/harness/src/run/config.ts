/**
 * The config a run is built from: the one it names, out of the ones the
 * deployment lists. A run that names none gets the first, so the chat is the
 * first one listed. que has no config of its own: a deployment lists at least one.
 */

import type { AgentDefinition } from "@que/core";

export function configFor(
  agents: AgentDefinition[],
  name: unknown,
): AgentDefinition {
  const named =
    name === undefined
      ? agents[0]
      : agents.find((agent) => agent.name === name);
  if (named) return named;
  // No fall back to the first: a run under the wrong config would look like a run under the right one.
  throw new Error(
    `no agent${name === undefined ? "" : ` ${JSON.stringify(name)}`}. ${
      agents.length
        ? `Agents: ${agents.map((agent) => agent.name).join(", ")}`
        : "This deployment lists no agents"
    }`,
  );
}
