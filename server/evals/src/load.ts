/**
 * What a deployment has to run: its name, the cases of its plugins, its agent configs and its model configs. Read
 * from the deployment's own files as mount reads them (readDeployment in @mku1tra/que-harness), and linted with the
 * harness schema as one graph, as mount lints them. The @mku1tra/que-plugin range check and the model facts are
 * mount's alone: they are about the @mku1tra/que-plugin mount hands a plugin, and the server that runs the cases
 * mounts.
 */

import {
  harness,
  lintDeployment,
  readDeployment,
  type Agent,
  type Model,
} from "@mku1tra/que-harness";
import { sayProblem, type Case, type ReadPlugin } from "@mku1tra/que-plugin";

export type LoadedCase = Case & { plugin: string };

// Each case, with the plugin that holds its capability: a case's plugin is its capability's, in the graph. The lint
// has held each capability to one plugin.
function casesOf(plugins: ReadPlugin[]): LoadedCase[] {
  const holder = new Map(
    plugins.flatMap(({ definition }) =>
      (definition?.plugin.capabilities ?? []).map(
        (capability) => [capability, definition!.plugin.name] as const,
      ),
    ),
  );
  return plugins.flatMap(({ cases }) =>
    cases.map((c) => ({ plugin: holder.get(c.capability)!, ...c })),
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
    const { problems, graph } = lintDeployment(read);
    if (problems.length)
      throw new Error(
        `the deployment cannot be run:\n- ${problems.map(sayProblem).join("\n- ")}`,
      );
    // No problem: each node the deployment names is in the graph.
    const deployment = graph.get(
      read.deployment!.name,
      harness.types.deployment,
    )!;
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
