/**
 * LangChain Agent Graph
 *
 * Chat factory: buildAgent(userId) assembles an agent for one user from the
 * packages they have access to, as the deployment's `agent` says: which of
 * those packages, the model, the instructions and the loop policy. How those
 * packages are put in front of the model is one config from src/assemble. Packages the user can't use are
 * never loaded. The user is fixed when the agent is built, so every tool call
 * runs as them.
 */

import { createAgent } from "langchain";
import { assemble } from "../assemble/assemble.js";
import { onDemand } from "../assemble/on-demand/index.js";
import { policyFor } from "../assemble/loop/index.js";
import { catalogFor } from "../access/catalog.js";
import { narrow } from "../access/narrow.js";
import { getConnection } from "../access/connections.js";
import { users } from "../access/users.js";
import * as mounted from "../mount/mounted.js";
import { modelFor } from "./model.js";

const MODEL = modelFor(mounted.agent, process.env);

export async function buildAgent(userId: string) {
  // Who the model is assisting, in que and in each connected service.
  const [user, reachable] = await Promise.all([
    users.get(userId).catch(() => undefined),
    catalogFor(userId),
  ]);
  const catalog = narrow(reachable, mounted.agent.packages);

  return createAgent({
    // "provider:model" format, set in the deployment's `agent` or via MODEL in .env
    model: MODEL,
    ...assemble(onDemand, {
      user,
      catalog,
      connect: (pkg) => getConnection(pkg, userId),
      instructions: mounted.agent.instructions,
      loop: policyFor(mounted.agent.loop),
    }),
  });
}

// Served by `langgraph dev`: a factory, so the server builds the agent per run
// for that run's user (`langgraph_auth_user_id`, set by the auth hook), with
// whatever they have connected right now. Calls without a user (e.g. fetching
// the graph schema) get no packages.
export const agent = (config?: { configurable?: Record<string, unknown> }) =>
  buildAgent(
    (config?.configurable?.langgraph_auth_user_id as string | undefined) ??
      "anonymous",
  );
