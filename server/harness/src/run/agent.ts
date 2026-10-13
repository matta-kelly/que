/**
 * LangChain Agent Graph
 *
 * Chat factory: buildAgent(userId) assembles an agent for one user from the
 * packages they have access to. How those packages are put in front of the
 * model is one config from src/legibility. Packages the user can't use are
 * never loaded. The user is fixed when the agent is built, so every tool call
 * runs as them.
 */

import { createAgent } from "langchain";
import { assemble } from "./legibility/assemble.js";
import { onDemand } from "./legibility/on-demand/index.js";
import { catalogFor } from "./mount/catalog.js";
import { getConnection } from "./mount/credentials.js";
import { users } from "./users.js";

const MODEL =
  process.env.MODEL ??
  "fireworks:accounts/fireworks/models/deepseek-v4p1-flash";

export async function buildAgent(userId: string) {
  // Who the model is assisting, in que and in each connected service.
  const [user, catalog] = await Promise.all([
    users.get(userId).catch(() => undefined),
    catalogFor(userId),
  ]);

  return createAgent({
    // "provider:model" format, set via MODEL in .env
    model: MODEL,
    ...assemble(onDemand, {
      user,
      catalog,
      connect: (pkg) => getConnection(pkg, userId),
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
