/**
 * Where a deployment is linted: a root (basis's lintRoot), the only place a lint starts. A deployment's root is the
 * root whose ground holds its folder (basis's rootOf): its own, when its folder has a basis.config.ts
 * (deploymentSchema), or a root above it whose schema takes its sources (deploymentSources), as a repo of a deployment
 * and its plugins has. Mount and the evals read the graph that root's lint gives (deploymentGraph).
 */

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defineSchema,
  lintRoot,
  rootOf,
  type Graph,
  type Problem,
} from "@mku1tra/basis";
import { notANote } from "@mku1tra/que-plugin";
import { harness } from "./schema.ts";
import { deploymentSources } from "./source.ts";

/**
 * The schema of a deployment that is a root of its own: its notes are its folder, `root`, and its sources are the
 * deployment's (deploymentSources). A note in it of one of its nodes is another piece of that node; README.md and each
 * skill's SKILL.md are no notes. A deployment's basis.config.ts gives it: `export default { schema:
 * deploymentSchema({ name, description, root: new URL("./", import.meta.url) }) }`.
 */
export function deploymentSchema({
  name,
  description,
  root,
}: {
  name: string;
  description: string;
  root: URL;
}) {
  const folder = fileURLToPath(root);
  return defineSchema({
    name,
    description,
    types: {},
    imports: [harness],
    notes: root,
    skip: notANote,
    sources: deploymentSources(folder, folder),
  });
}

/**
 * The lint of the root whose ground holds the deployment in `dir`: the root, its problems, each at its file's full
 * path, and its graph, which a program runs on once the problems are none. Throws when no root holds the folder.
 */
export async function deploymentGraph(
  dir: string,
): Promise<{ root: string; problems: Problem[]; graph: Graph }> {
  const root = rootOf(dir);
  if (root === undefined)
    throw new Error(
      `${dir} is in no root: a deployment is linted from the root whose ground holds it, the first folder up from it with a basis.config.ts. Give its folder one whose schema is deploymentSchema, or a folder above it one whose schema's sources are deploymentSources.`,
    );
  const { problems, graph } = await lintRoot(root);
  return {
    root,
    problems: problems.map((problem) => ({
      ...problem,
      path: join(root, problem.path),
    })),
    graph,
  };
}
