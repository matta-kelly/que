/** The loop policies, by the name a deployment's `agent` gives one. */

import type { Loop } from "@que/core";
import { compact } from "./compact.js";
import { keepAll } from "./keep-all.js";
import type { Policy } from "./policy.js";

const POLICIES: Record<Loop, Policy> = { "keep-all": keepAll, compact };

/** The policy an agent runs with: the one named, or keep-all when none is. */
export const policyFor = (name: Loop = "keep-all") => POLICIES[name];
