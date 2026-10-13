/**
 * LangChain Agent Graph
 *
 * Chat factory: buildAgent(userId, name, model) assembles an agent for one user from
 * the packages they have access to, as one of the deployment's agent configs
 * says: which of those packages, the model, the instructions, how the
 * packages are put in front of the model, the loop it runs in, and if it
 * takes the user's own instructions. The loop
 * names the engine that builds the agent. The model is the one the run names,
 * then the config's, then the first the deployment lists. The config is the one the run names,
 * or the first the deployment lists. Packages the user can't use are never
 * loaded. The user is fixed when the agent is built, so every tool call runs
 * as them.
 *
 * A run is traced when the deployment's `.env` says where to send the trace
 * (run/trace.ts). A fault in those settings stops the server when it starts,
 * and so does a file for the user's instructions that cannot be read.
 */

import { assemble } from "../assemble/assemble.js";
import { catalogFor } from "../access/catalog.js";
import { narrow } from "../access/narrow.js";
import { getConnection } from "../access/connections.js";
import { fromFile, taken } from "../access/instructions.js";
import { instructionsFile, userInstructions, users } from "../access/users.js";
import * as mounted from "../mount/mounted.js";
import { configFor } from "./config.js";
import { build } from "./engine/index.js";
import { loadingFor } from "./loading.js";
import { loopFor } from "./loop.js";
import { chatModel, modelFor } from "./model.js";
import { stamp } from "./stamp.js";
import { runOf, settingsFor, startTracing } from "./trace.js";

const traced = startTracing(settingsFor(process.env));
if (instructionsFile) await fromFile(instructionsFile);

export async function buildAgent(
  userId: string,
  name?: unknown,
  modelName?: unknown,
) {
  const config = configFor(mounted.agents, name);
  const model = modelFor(mounted.models, config, modelName);
  // Who the model is assisting, in que and in each connected service.
  const [user, reachable] = await Promise.all([
    users.get(userId).catch(() => undefined),
    catalogFor(userId),
  ]);
  const catalog = narrow(reachable, config.packages);
  // A call with no user has no text of theirs.
  const own = user && (await userInstructions(userId)).text;

  const parts = assemble(loadingFor(config), {
    user: user && { ...user, instructions: taken(config, own) },
    catalog,
    connect: (pkg) => getConnection(pkg, userId),
    instructions: config.instructions,
  });
  return build(loopFor(mounted.loops, config), {
    model: await chatModel(model),
    window: model.window,
    ...parts,
    // Each reply says which model config gave it.
    middleware: [...parts.middleware, stamp(model.name)],
  });
}

// Served by `langgraph dev`: a factory, so the server builds the agent per run
// for that run's user (`langgraph_auth_user_id`, set by the auth hook), with
// whatever they have connected right now, under the agent config the run
// names (`agent`, sent in the run's configurable), on the model the run names
// (`model`, sent the same way). Calls without a user (e.g.
// fetching the graph schema) get no packages. The server says what each call
// is for in its second argument, and only a run is traced.
export const agent = async (
  config?: { configurable?: Record<string, unknown> },
  runtime?: { accessContext?: string },
) =>
  traced(
    await buildAgent(
      (config?.configurable?.langgraph_auth_user_id as string | undefined) ??
        "anonymous",
      config?.configurable?.agent,
      config?.configurable?.model,
    ),
    runOf(
      config,
      runtime,
      configFor(mounted.agents, config?.configurable?.agent),
    ),
  );
