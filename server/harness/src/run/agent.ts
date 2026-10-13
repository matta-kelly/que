/**
 * LangChain Agent Graph
 *
 * Chat factory: buildAgent(userId, name) assembles an agent for one user from
 * the packages they have access to, as one of the deployment's agent configs
 * says: which of those packages, the model, the instructions, how the
 * packages are put in front of the model, and the loop it runs in. The loop
 * names the engine that builds the agent. The config is the one the run names,
 * or the first the deployment lists. Packages the user can't use are never
 * loaded. The user is fixed when the agent is built, so every tool call runs
 * as them.
 */

import { assemble } from "../assemble/assemble.js";
import { catalogFor } from "../access/catalog.js";
import { narrow } from "../access/narrow.js";
import { getConnection } from "../access/connections.js";
import { users } from "../access/users.js";
import * as mounted from "../mount/mounted.js";
import { configFor } from "./config.js";
import { build } from "./engine/index.js";
import { legibilityFor } from "./legibility.js";
import { loopFor } from "./loop.js";
import { modelFor } from "./model.js";

export async function buildAgent(userId: string, name?: unknown) {
  const config = configFor(mounted.agents, name);
  // Who the model is assisting, in que and in each connected service.
  const [user, reachable] = await Promise.all([
    users.get(userId).catch(() => undefined),
    catalogFor(userId),
  ]);
  const catalog = narrow(reachable, config.packages);

  return build(loopFor(mounted.loops, config), {
    // "provider:model" format, set in the config or via MODEL in .env
    model: modelFor(config, process.env),
    ...assemble(legibilityFor(config), {
      user,
      catalog,
      connect: (pkg) => getConnection(pkg, userId),
      instructions: config.instructions,
    }),
  });
}

// Served by `langgraph dev`: a factory, so the server builds the agent per run
// for that run's user (`langgraph_auth_user_id`, set by the auth hook), with
// whatever they have connected right now, under the agent config the run
// names (`agent`, sent in the run's configurable). Calls without a user (e.g.
// fetching the graph schema) get no packages.
export const agent = (config?: { configurable?: Record<string, unknown> }) =>
  buildAgent(
    (config?.configurable?.langgraph_auth_user_id as string | undefined) ??
      "anonymous",
    config?.configurable?.agent,
  );
