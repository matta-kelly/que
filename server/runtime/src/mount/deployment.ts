/**
 * Mount: read a deployment from disk and run on its graph. A deployment is a folder whose index.ts has its definition
 * as the default export, with its agents, loops and models in files of their own under agents/, loops/ and models/,
 * and its plugins installed by name (readDeployment in @mku1tra/que-harness). Mount gives each model the facts its
 * file does not write (models.ts), lints the whole deployment with the harness schema as one graph, and fails on any
 * problem: a file that cannot be read, a link that does not resolve (a plugin, model or loop an agent names that the
 * deployment does not give), a rule (an agent's model or loop the deployment does not name, a maxTokens above the
 * window). Then it runs on the graph's nodes. A `MODEL` setting, which que no longer reads, fails too.
 */

import "./supply.js";
import {
  harness,
  lintDeployment,
  piecesOf,
  readDeployment,
  type Agent,
  type Loop,
  type MountedModel,
} from "@mku1tra/que-harness";
import { sayProblem } from "@mku1tra/que-plugin";
import { factSources, type FactSources } from "./model-facts/index.js";
import { factPieces } from "./models.js";
import { deploymentFolder } from "./deployment-folder.js";
import { checkRange, type MountedPlugin } from "./plugins.js";

const { types } = harness;

export async function mountDeployment(
  dir: string,
  env: {
    MODEL?: string;
    FIREWORKS_API_KEY?: string;
    BEAM_API_KEY?: string;
  } = {},
  // Where a model's window and price come from when its file writes none. A test hands in its own.
  sources: FactSources = factSources(dir, env),
): Promise<{
  plugins: MountedPlugin[];
  agents: Agent[];
  loops: Loop[];
  models: MountedModel[];
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
  const { problems, graph } = lintDeployment(
    read,
    // Only the models the deployment names: another file in models/ is not run, and is asked for nothing.
    await factPieces(
      read.models.filter(({ node }) =>
        read.deployment!.models.includes(node.name),
      ),
      sources,
    ),
  );
  if (problems.length)
    throw new Error(
      `mount: deployment ${dir} breaks the harness schema:\n- ${problems.map(sayProblem).join("\n- ")}`,
    );
  // No problem: each node the deployment names is in the graph.
  const deployment = graph.get(read.deployment!.name, types.deployment)!;
  const named = <T extends (typeof types)[keyof typeof types]>(
    names: string[],
    type: T,
  ) => names.map((name) => graph.get(name, type)!);
  return {
    plugins: (deployment.plugins ?? []).map((name) => {
      const plugin = read.plugins.find(
        (p) => p.definition!.plugin.name === name,
      )!;
      return { definition: plugin.definition!, skills: plugin.skills };
    }),
    agents: named(deployment.agents, types.agent),
    loops: named(deployment.loops, types.loop),
    models: named(deployment.models, types.model) as MountedModel[],
  };
}

export async function mountFromEnv(env: {
  QUE_DEPLOYMENT?: string;
  MODEL?: string;
  FIREWORKS_API_KEY?: string;
  BEAM_API_KEY?: string;
}): Promise<MountedPlugin[]> {
  return (await mountDeployment(deploymentFolder(env), env)).plugins;
}
