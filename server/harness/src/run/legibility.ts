/**
 * The way a config has the model shown its environment: the code behind the
 * name in its `legibility`. The one place a name is turned into code.
 */

import type { AgentDefinition, Legibility } from "@que/core";
import type { Config } from "../assemble/config.js";
import { onDemand } from "../assemble/on-demand/index.js";

const WAYS: Record<Legibility, Config> = { "on-demand": onDemand };

export function legibilityFor(agent: AgentDefinition): Config {
  return WAYS[agent.legibility ?? "on-demand"];
}
