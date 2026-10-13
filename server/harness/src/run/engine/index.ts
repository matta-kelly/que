/**
 * The engine that builds a run's agent: the code behind the name in its
 * loop's `engine`. The one place that name is turned into code.
 */

import type { Engine, ResolvedLoop } from "@que/core";
import { deepagents } from "./deepagents.js";
import type { Parts } from "./parts.js";
import { plain } from "./plain.js";

const ENGINES = { plain, deepagents } satisfies Record<
  Engine,
  (parts: Parts, loop: ResolvedLoop) => unknown
>;

export function build(loop: ResolvedLoop, parts: Parts) {
  return ENGINES[loop.engine](parts, loop);
}
