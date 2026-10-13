/** What every engine is handed: the parts of one agent, as assemble and the config give them. */

import type { AgentMiddleware, StructuredTool } from "langchain";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export type Parts = {
  /** In "provider:model" form, or a model that is already made. */
  model: string | BaseChatModel;
  systemPrompt: string;
  tools: StructuredTool[];
  middleware: AgentMiddleware[];
};
