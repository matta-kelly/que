/**
 * What a deployment has to run: its name, the cases of its plugins, its agent configs and its model configs. Read
 * from the deployment's own files as mount reads them (readDeployment in @mku1tra/que-harness), and linted from its
 * root as one graph, as mount lints it (deploymentGraph), so each model has its facts, from the model catalog or its
 * file, as mount's do.
 * The @mku1tra/que-plugin range check is mount's alone: it is about the @mku1tra/que-plugin mount hands a plugin, and
 * the server that runs the cases mounts.
 */

import {
  deploymentGraph,
  harness,
  readDeployment,
  type Agent,
  type Model,
} from "@mku1tra/que-harness";
import { sayProblem, type Case, type ReadPlugin } from "@mku1tra/que-plugin";

export type LoadedCase = Case & { plugin: string };

// Each case, with the plugin it was read from: the one whose cases.ts holds it. The lint has held its capability to be
// one that plugin lists (plugin/case-capability).
function casesOf(plugins: ReadPlugin[]): LoadedCase[] {
  return plugins.flatMap(({ definition, cases }) =>
    definition
      ? cases.map((c) => ({ plugin: definition.plugin.name, ...c }))
      : [],
  );
}

export async function load(folder: string): Promise<{
  deployment: string;
  cases: LoadedCase[];
  agents: Agent[];
  models: Model[];
}> {
  try {
    const read = await readDeployment(folder);
    const { root, problems, graph } = await deploymentGraph(folder);
    if (problems.length)
      throw new Error(
        `the deployment cannot be run:\n- ${problems.map(sayProblem).join("\n- ")}`,
      );
    const deployment = read.deployment
      ? graph.get(read.deployment.name, harness.types.deployment)
      : undefined;
    if (!deployment)
      throw new Error(
        `the root ${root} gives no deployment of this folder: its schema's sources are not deploymentSources of it`,
      );
    // No problem: each node the deployment names is in the graph.
    return {
      deployment: deployment.name,
      cases: casesOf(read.plugins),
      agents: deployment.agents.map((name) =>
        graph.get(name, harness.types.agent)!,
      ),
      models: deployment.models.map((name) =>
        graph.get(name, harness.types.model)!,
      ),
    };
  } catch (error) {
    throw new Error(`eval: ${folder}: ${(error as Error).message}`, {
      cause: error,
    });
  }
}
