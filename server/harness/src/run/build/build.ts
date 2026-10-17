/**
 * Builds a run's agent: the framework's own agent, with the parts, the repair
 * of a chat, the repeat guard, and a middleware for each setting of the loop
 * that acts. Each difference between two agents comes from their configs, so a
 * result of an eval can be put down to a config. The middlewares are the ones
 * a LangChain deep agent is made of, each taken alone, LangChain's own
 * summary, and que's own repeat guard.
 */

import {
  StateBackend,
  createFilesystemMiddleware,
  createPatchToolCallsMiddleware,
} from "deepagents";
import { createAgent, summarizationMiddleware } from "langchain";
import type { ResolvedLoop } from "@que/core";
import type { Parts } from "./parts.js";
import { repeatGuard } from "./repeat.js";

type Backend = Parameters<typeof createFilesystemMiddleware>[0] extends
  { backend?: infer B } | undefined
  ? B
  : never;

// The files are kept in the thread's state, so they are saved with the chat.
const backend = ((config) => new StateBackend(config)) as Backend;

export function build(
  loop: ResolvedLoop,
  { model, window, systemPrompt, tools, middleware }: Parts,
) {
  // The framework does not know the window of every model, so a share is handed over as a count.
  const tokens = (share: number) => Math.floor(share * window);

  return createAgent({
    model,
    systemPrompt,
    tools,
    middleware: [
      // A run that was stopped between a tool call and its result leaves a chat a model reads as one where the call ran.
      // First, so que's own middleware sees the repaired chat.
      createPatchToolCallsMiddleware(),
      // On for every agent, as the repair is. Before the summary, so a run that ends does not pay for one.
      repeatGuard(),
      ...(loop.result
        ? [
            createFilesystemMiddleware({
              backend,
              // The model reads back a result that was moved out. Any other tool of files would be one no config chose.
              tools: ["read_file"],
              toolTokenLimitBeforeEvict: loop.result.max,
              // A long message of the user is moved out too by default, and no setting of a loop says so.
              humanMessageTokenLimitBeforeEvict: null,
            }),
          ]
        : []),
      ...(loop.summarize
        ? [
            // The old part of the chat is replaced by the summary in the thread, so the chat keeps the summary and not the old messages.
            summarizationMiddleware({
              model,
              trigger: { tokens: tokens(loop.summarize.at) },
              keep: { tokens: tokens(loop.summarize.keep) },
            }),
          ]
        : []),
      ...middleware,
    ],
  });
}
