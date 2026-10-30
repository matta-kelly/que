/**
 * Mount: read a deployment from disk and run on its graph. A deployment is a folder whose index.ts has its definition
 * as the default export, with its agents, loops and models in files of their own under agents/, loops/ and models/,
 * and its plugins installed by name (readDeployment in @mku1tra/que-harness). Mount lints the deployment from its root,
 * the root whose ground holds its folder (deploymentGraph in @mku1tra/que-harness), as one graph, and fails on any
 * problem: a file that cannot be read, a link that does not resolve (a plugin, model or loop an agent names that the
 * deployment does not give), a rule (an agent's model or loop the deployment does not name, a maxTokens above the
 * window), a field a node needs (a model's window, from the model catalog or its file). Then it runs on that graph's
 * nodes. A `MODEL` setting, which que no longer reads, fails too, and so do two agents on one model id whose loops
 * summarize differently.
 */

import "./supply.js";
import {
  deploymentGraph,
  harness,
  piecesOf,
  providerOf,
  readDeployment,
  resolveLoop,
  type Agent,
  type Loop,
  type Model,
} from "@mku1tra/que-harness";
import { sayProblem } from "@mku1tra/que-plugin";
import { PROVIDERS } from "./models.js";
import { deploymentFolder } from "./deployment-folder.js";
import { checkRange, type MountedPlugin } from "./plugins.js";

const { types } = harness;

export async function mountDeployment(
  dir: string,
  env: { MODEL?: string } = {},
): Promise<{
  /** The deployment's name, which names its data (runner/pi/harness.ts). */
  name: string;
  plugins: MountedPlugin[];
  agents: Agent[];
  loops: Loop[];
  models: Model[];
}> {
  if (env.MODEL !== undefined)
    throw new Error(
      "mount: MODEL is set, and que no longer reads it: a model is a file of its own, in the deployment's models/",
    );
  const read = await readDeployment(dir);
  for (const plugin of read.plugins)
    checkRange(plugin.dir, plugin.files.package);
  const unreadable = piecesOf(read).problems;
  if (unreadable.length)
    throw new Error(
      `mount: deployment ${dir} cannot be read:\n- ${unreadable.map(sayProblem).join("\n- ")}`,
    );
  // Only the models the deployment names: another file in models/ is not run.
  for (const { node: model } of read.models)
    if (
      read.deployment!.models.includes(model.name) &&
      !PROVIDERS.includes(providerOf(model))
    )
      throw new Error(
        `mount: the model "${model.name}" has the provider "${providerOf(model)}", which que does not have. Providers: ${PROVIDERS.join(", ")}`,
      );
  let linted: Awaited<ReturnType<typeof deploymentGraph>>;
  try {
    linted = await deploymentGraph(dir);
  } catch (error) {
    throw new Error(`mount: ${(error as Error).message}`, { cause: error });
  }
  const { root, problems, graph } = linted;
  if (problems.length)
    throw new Error(
      `mount: deployment ${dir} breaks the harness schema:\n- ${problems.map(sayProblem).join("\n- ")}`,
    );
  const deployment = graph.get(read.deployment!.name, types.deployment);
  if (!deployment)
    throw new Error(
      `mount: the root ${root} gives no deployment ${read.deployment!.name}: its schema's sources are not deploymentSources of ${dir}`,
    );
  // No problem: each node the deployment names is in the graph.
  const named = <T extends (typeof types)[keyof typeof types]>(
    names: string[],
    type: T,
  ) => names.map((name) => graph.get(name, type)!);
  const agents = named(deployment.agents, types.agent);
  const loops = named(deployment.loops, types.loop);
  const models = named(deployment.models, types.model);
  oneSummaryPerModel(agents, loops, models);
  return {
    name: deployment.name,
    plugins: (deployment.plugins ?? []).map((name) => {
      const plugin = read.plugins.find(
        (p) => p.definition!.plugin.name === name,
      )!;
      return { definition: plugin.definition!, skills: plugin.skills };
    }),
    agents,
    loops,
    models,
  };
}

/**
 * Stops on two agents on one model id whose loops summarize differently: pi sets compaction per model, by its
 * `provider/modelId` (runner/pi/harness.ts), not per conversation, so they could not each have their own. Two model
 * entries with one id are one model to pi.
 */
function oneSummaryPerModel(agents: Agent[], loops: Loop[], models: Model[]) {
  const first = new Map<
    string,
    { agent: string; model: string; summarize: string }
  >();
  for (const agent of agents) {
    const loop = loops.find((l) => l.name === agent.loop)!;
    const summarize = JSON.stringify(resolveLoop(loop).summarize);
    const { id } = models.find((m) => m.name === agent.model)!;
    const had = first.get(id);
    if (!had)
      first.set(id, { agent: agent.name, model: agent.model, summarize });
    else if (had.summarize !== summarize)
      throw new Error(
        `mount: the agents "${had.agent}" (model "${had.model}") and "${agent.name}" (model "${agent.model}") are on the model id "${id}" with loops that summarize differently (${had.summarize} and ${summarize}): pi sets compaction per model id, so agents on one model id must summarize alike. Give one of them a model with another id, or make their loops summarize alike`,
      );
  }
}

export async function mountFromEnv(env: {
  QUE_DEPLOYMENT?: string;
  MODEL?: string;
}): Promise<MountedPlugin[]> {
  return (await mountDeployment(deploymentFolder(env), env)).plugins;
}
