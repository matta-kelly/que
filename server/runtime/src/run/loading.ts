/**
 * The way a config has the model shown its environment: the code behind the
 * name in its `loading`. The one place a name is turned into code.
 */

import type { Agent, Loading } from "@mku1tra/que-harness";
import type { Config } from "../assemble/config.js";
import { eager } from "../assemble/eager/index.js";
import { onDemand } from "../assemble/on-demand/index.js";

const WAYS: Record<Loading, Config> = { "on-demand": onDemand, eager };

export function loadingFor(agent: Agent): Config {
  return WAYS[agent.loading ?? "on-demand"];
}
