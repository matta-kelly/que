/**
 * The config a run is built from: the one it names, out of the ones the
 * deployment lists. A run that names none gets the first, so the chat is the
 * first one listed. que has no config of its own: a deployment lists at least one.
 */

import type { Agent } from "@mku1tra/que-harness";

export function configFor(agents: Agent[], name: unknown): Agent {
  // A deployment lists at least one agent.
  if (name === undefined) return agents[0];
  const named = agents.find((agent) => agent.name === name);
  if (named) return named;
  // No fall back to the first: a run under the wrong config would look like a run under the right one.
  throw new Error(
    `no agent ${JSON.stringify(name)}. Agents: ${agents.map((agent) => agent.name).join(", ")}`,
  );
}
