/**
 * A config is one way of putting the user's plugins in front of the agent.
 * It declares only what differs from one way to the next; assemble adds what
 * every way shares.
 */

import type { BaseMessage, StructuredTool } from "langchain";
import type { Catalog } from "../access/catalog.js";

export type Config = {
  name: string;
  /** The text that explains the environment and how to use the config's tools. */
  prompt: (catalog: Catalog) => string;
  /** The tools the config adds for finding the way around. */
  tools: (catalog: Catalog) => StructuredTool[];
  /** Of all operation tool names, the ones that go out with this request. */
  send: (messages: BaseMessage[], operations: string[]) => string[];
};
