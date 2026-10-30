/**
 * The eager way: every operation is a tool from the first message, so the
 * agent has nothing to open or load.
 */

import type { Way } from "../way.js";
import { prompt } from "./prompt.js";

export const eager: Way = {
  name: "eager",
  prompt,
  deferred: false,
};
