/**
 * An agent config: one way a deployment's plugins are run. A node of the agent type: its plugins, the model it runs
 * on, the loop it runs in, its instructions, how it is shown the environment, and if it takes the user's own
 * instructions. A config is a file of its own, in the deployment's agents/. Framework-free, as the plugin contract is.
 */

import { defineNode, type NodeOf } from "./define.ts";

export { LOADING } from "./schema.ts";

/** What `defineAgent` returns, and an agent file exports as its default. */
export type Agent = NodeOf<"agent">;

export type Loading = NonNullable<Agent["loading"]>;

export const defineAgent = defineNode("agent");
