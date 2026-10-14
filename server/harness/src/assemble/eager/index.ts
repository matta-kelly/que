/**
 * The eager config: every operation is a tool from the first message, so the
 * agent has nothing to open or load.
 */

import type { Config } from "../config.js";
import { prompt } from "./prompt.js";

export const eager: Config = {
  name: "eager",
  prompt,
  tools: () => [],
  send: (_messages, operations) => operations,
};
