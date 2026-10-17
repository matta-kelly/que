/**
 * The runs to make: each case under each agent config, grouped by case. A
 * case is not run under a config that cannot reach its package: that run
 * would say nothing about the case.
 */

import type { Agent, LoadedCase } from "./load.js";

/** One case under one config. With `skipped`, it is not made, and this is why. */
export type Planned = { case: LoadedCase; agent: string; skipped?: string };

export function plan(
  cases: LoadedCase[],
  agents: Agent[],
  named: string[],
): Planned[] {
  const listed = agents.map((agent) => agent.name);
  for (const name of named) {
    if (!listed.includes(name))
      throw new Error(
        `eval: no agent ${JSON.stringify(name)}. ${
          listed.length
            ? `Agents: ${listed.join(", ")}`
            : "This deployment lists no agents"
        }`,
      );
  }
  const chosen = named.length
    ? agents
        .filter((agent) => named.includes(agent.name))
        .sort((a, b) => named.indexOf(a.name) - named.indexOf(b.name))
    : agents;

  return cases.flatMap((c) =>
    chosen.map((agent): Planned =>
      agent.packages.includes(c.package)
        ? { case: c, agent: agent.name }
        : {
            case: c,
            agent: agent.name,
            skipped: `${agent.name} does not have ${c.package}`,
          },
    ),
  );
}
