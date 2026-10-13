/**
 * The plain engine: the framework's own agent, with the parts and one thing
 * more: the repair of a chat that has a tool call with no result, which the
 * deep engine has too. A run that was stopped between a call and its result
 * leaves such a chat, and a model that is sent it reads the call as one that
 * ran. No setting of a loop acts on this engine.
 */

import { createPatchToolCallsMiddleware } from "deepagents";
import { createAgent } from "langchain";
import type { Parts } from "./parts.js";

export const plain = ({ model, systemPrompt, tools, middleware }: Parts) =>
  createAgent({
    model,
    systemPrompt,
    tools,
    // First, so que's own middleware sees the repaired chat.
    middleware: [createPatchToolCallsMiddleware(), ...middleware],
  });
