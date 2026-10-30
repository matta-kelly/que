/**
 * A way of putting the user's plugins in front of the agent, as pi takes it: its prompt, and whether an operation
 * waits for the agent to load it.
 */

import type { Catalog } from "../access/catalog.js";

export type Way = {
  name: string;
  /** The text that explains the environment and how to use the way's tools. */
  prompt: (catalog: Catalog) => string;
  /** Whether each operation is held back from the model until the agent loads it. */
  deferred: boolean;
};
