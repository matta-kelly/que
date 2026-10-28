/**
 * A deployment: its name, and the plugins, agents, loops and models it runs, each by its name. A node of the
 * deployment type, in the deployment's index.ts. Framework-free, as the plugin contract is.
 */

import { defineNode, type NodeOf } from "./define.ts";

/** What `defineDeployment` returns, and a deployment's index.ts exports as its default. */
export type Deployment = NodeOf<"deployment">;

export const defineDeployment = defineNode("deployment");
