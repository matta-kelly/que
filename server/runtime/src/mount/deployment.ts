/**
 * Mount: read a deployment from disk and run on its graph. A deployment is a folder whose index.ts has its definition
 * as the default export, with its plugins installed by name (readDeployment in @mku1tra/que-harness). Mount lints the
 * deployment from its root, the root whose ground holds its folder (deploymentGraph in @mku1tra/que-harness), as one
 * graph, and fails on any problem: a file that cannot be read, a link that does not resolve (a plugin the deployment
 * names that is not installed), a field a node needs. Then it mounts each plugin the deployment names, with its skills
 * as MCP serves them (skills.ts).
 */

import "./supply.js";
import {
  deploymentGraph,
  harness,
  piecesOf,
  readDeployment,
} from "@mku1tra/que-harness";
import { checkedCard, sayProblem } from "@mku1tra/que-plugin";
import { deploymentFolder } from "./deployment-folder.js";
import { checkRange, type MountedPlugin } from "./plugins.js";
import { servedSkills } from "./skills.js";

const { types } = harness;

export async function mountDeployment(dir: string): Promise<{
  /** The deployment's name. */
  name: string;
  plugins: MountedPlugin[];
}> {
  const read = await readDeployment(dir);
  for (const plugin of read.plugins)
    checkRange(plugin.dir, plugin.files.package);
  const unreadable = piecesOf(read).problems;
  if (unreadable.length)
    throw new Error(
      `mount: deployment ${dir} cannot be read:\n- ${unreadable.map(sayProblem).join("\n- ")}`,
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
  return {
    name: deployment.name,
    plugins: await Promise.all(
      (deployment.plugins ?? []).map(async (name) => {
        const plugin = read.plugins.find(
          (p) => p.definition!.plugin.name === name,
        )!;
        return {
          definition: plugin.definition!,
          skills: await servedSkills(name, plugin.skills, plugin.files.skill),
          card: checkedCard(plugin.dir, {
            ...plugin,
            definition: plugin.definition!,
          }),
        };
      }),
    ),
  };
}

export async function mountFromEnv(env: {
  QUE_DEPLOYMENT?: string;
}): Promise<MountedPlugin[]> {
  return (await mountDeployment(deploymentFolder(env))).plugins;
}
