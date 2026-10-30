/**
 * Mount: read a deployment from disk and run on its graph. A deployment is a folder whose index.ts has its definition
 * as the default export, with its agents, loops and models in files of their own under agents/, loops/ and models/,
 * and its plugins installed by name (readDeployment in @mku1tra/que-harness). Mount lints the deployment from its root,
 * the root whose ground holds its folder (deploymentGraph in @mku1tra/que-harness), as one graph, and fails on any
 * problem: a file that cannot be read, a link that does not resolve (a plugin, model or loop an agent names that the
 * deployment does not give), a rule (an agent's model or loop the deployment does not name, a maxTokens above the
 * window), a field a node needs (a model's window, from the model catalog or its file). Then it runs on that graph's
 * nodes. A `MODEL` setting, which que no longer reads, fails too.
 */

import "./supply.js";
import {
  deploymentGraph,
  harness,
  piecesOf,
  providerOf,
  readDeployment,
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
  return {
    name: deployment.name,
    plugins: (deployment.plugins ?? []).map((name) => {
      const plugin = read.plugins.find(
        (p) => p.definition!.plugin.name === name,
      )!;
      return { definition: plugin.definition!, skills: plugin.skills };
    }),
    agents: named(deployment.agents, types.agent),
    loops: named(deployment.loops, types.loop),
    models: named(deployment.models, types.model),
  };
}

export async function mountFromEnv(env: {
  QUE_DEPLOYMENT?: string;
  MODEL?: string;
}): Promise<MountedPlugin[]> {
  return (await mountDeployment(deploymentFolder(env), env)).plugins;
}
