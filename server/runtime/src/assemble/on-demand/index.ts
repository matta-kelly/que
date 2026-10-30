/**
 * The on-demand way: the agent starts with no operations in reach, opens a
 * plugin to see what it holds, and loads the operations it needs.
 */

import type { Way } from "../way.js";
import { prompt } from "./prompt.js";

export const onDemand: Way = {
  name: "on-demand",
  prompt,
  deferred: true,
};
