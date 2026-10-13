/** The keep-all policy: the model is sent the whole chat with every request. */

import type { Policy } from "./policy.js";

export const keepAll: Policy = { name: "keep-all", middleware: () => [] };
