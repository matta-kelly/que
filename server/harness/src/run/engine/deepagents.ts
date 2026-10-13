/**
 * The deepagents engine: a LangChain deep agent, handed que's parts. It adds
 * its own tools and middleware around them: a file store kept in the thread's
 * state, a subagent, and summarization. Of a loop's settings, `result` drives
 * it; the rest run on the engine's own defaults.
 */

import {
  StateBackend,
  createDeepAgent,
  createFilesystemMiddleware,
} from "deepagents";
import type { ResolvedLoop } from "@que/core";
import type { Parts } from "./parts.js";

export const deepagents = (parts: Parts, loop: ResolvedLoop) =>
  createDeepAgent({
    ...parts,
    middleware: [
      // Of the engine's own name, so it takes the place of the one the engine makes.
      createFilesystemMiddleware({
        backend: (config) => new StateBackend(config),
        toolTokenLimitBeforeEvict: loop.result ? loop.result.max : null,
      }),
      ...parts.middleware,
    ],
  });
