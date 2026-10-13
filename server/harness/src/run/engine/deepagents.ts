/**
 * The deepagents engine: a LangChain deep agent, handed que's parts. It adds
 * its own tools and middleware around them: a file store kept in the thread's
 * state, a subagent, and summarization. Of a loop's settings, `result` and
 * `summarize` drive it; the rest run on the engine's own defaults.
 */

import {
  StateBackend,
  createDeepAgent,
  createFilesystemMiddleware,
  createSummarizationMiddleware,
} from "deepagents";
import { LOOP_DEFAULTS, type ResolvedLoop } from "@que/core";
import type { Parts } from "./parts.js";

type Backend = Parameters<typeof createFilesystemMiddleware>[0] extends
  { backend?: infer B } | undefined
  ? B
  : never;

const backend = ((config) => new StateBackend(config)) as Backend;

export function deepagents(
  { model, window, systemPrompt, tools, middleware }: Parts,
  loop: ResolvedLoop,
) {
  // The framework does not know the window of every model, so a share is handed over as a count.
  const tokens = (share: number) => ({
    type: "tokens" as const,
    value: Math.floor(share * window),
  });
  const { at, keep } = loop.summarize || LOOP_DEFAULTS.summarize;

  return createDeepAgent({
    model,
    systemPrompt,
    tools,
    middleware: [
      // Each is of the engine's own name, so it takes the place of the one the engine makes.
      createFilesystemMiddleware({
        backend,
        toolTokenLimitBeforeEvict: loop.result ? loop.result.max : null,
      }),
      createSummarizationMiddleware({
        backend,
        // Off is a size no chat reaches. The engine still summarizes when the provider says the chat is too long.
        trigger: loop.summarize
          ? tokens(at)
          : { type: "tokens", value: Number.MAX_SAFE_INTEGER },
        keep: tokens(keep),
      }),
      ...middleware,
    ],
  });
}
