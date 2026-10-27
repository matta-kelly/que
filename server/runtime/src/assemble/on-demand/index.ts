/**
 * The on-demand config: the agent starts with no operations in reach, opens a
 * plugin to see what it holds, and loads the operations it needs.
 */

import type { Config } from "../config.js";
import { prompt } from "./prompt.js";
import { send } from "./send.js";
import { tools } from "./tools.js";

export const onDemand: Config = { name: "on-demand", prompt, tools, send };
