/** The plain engine: the framework's own agent, with the parts and nothing more. No setting of a loop acts on it. */

import { createAgent } from "langchain";
import type { Parts } from "./parts.js";

export const plain = ({ model, systemPrompt, tools, middleware }: Parts) =>
  createAgent({ model, systemPrompt, tools, middleware });
