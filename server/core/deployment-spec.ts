/**
 * The contract every deployment is written against: its name, the packages
 * it uses, the agent configs it can run, and its loop and model configs. Framework-free, as the package
 * contract is.
 */

import { NAME } from "./package-spec.js";

/** What `defineDeployment` returns, and a deployment exports as its default. */
export type DeploymentDefinition = {
  name: string;
  /** One folder per package: an absolute path, or one taken from the deployment's own folder. */
  packages: string[];
  /** One file per agent config: an absolute path, or one taken from the deployment's own folder. At least one: que has no agent of its own. */
  agents: string[];
  /** One file per loop config: an absolute path, or one taken from the deployment's own folder. */
  loops?: string[];
  /** One file per model config: an absolute path, or one taken from the deployment's own folder. At least one: que has no model of its own. */
  models: string[];
};

export function defineDeployment(
  definition: DeploymentDefinition,
): DeploymentDefinition {
  return definition;
}

/**
 * Check a definition against the contract, throwing one error that lists
 * every problem. Types can't catch these: a deployment is loaded at runtime.
 */
export function validateDeployment(
  def: unknown,
): asserts def is DeploymentDefinition {
  if (!def || typeof def !== "object")
    throw new Error("deployment: no definition (default export)");
  const { name, packages, agents, agent, loops, models } = def as Record<
    string,
    unknown
  >;
  const problems: string[] = [];
  const deployment = name || "(unnamed)";

  if (typeof name !== "string" || !name.trim())
    problems.push("deployment name is missing");
  if (typeof name === "string" && !NAME.test(name))
    problems.push(`deployment name "${name}" must match ${NAME}`);
  if (!Array.isArray(packages))
    problems.push(`packages of deployment ${deployment} must be an array`);

  for (const folder of Array.isArray(packages) ? packages : []) {
    if (typeof folder !== "string" || !folder.trim())
      problems.push(
        `packages of deployment ${deployment} must each be a folder path, got ${JSON.stringify(folder)}`,
      );
  }

  for (const [list, files] of Object.entries({ agents, loops, models })) {
    if (files !== undefined && !Array.isArray(files))
      problems.push(`${list} of deployment ${deployment} must be an array`);
    for (const file of Array.isArray(files) ? files : []) {
      if (typeof file !== "string" || !file.trim())
        problems.push(
          `${list} of deployment ${deployment} must each be a file path, got ${JSON.stringify(file)}`,
        );
    }
  }
  // que has no agent or model of its own to fall back on.
  for (const [list, files] of Object.entries({ agents, models }))
    if (files === undefined || (Array.isArray(files) && !files.length))
      problems.push(
        `deployment ${deployment} lists no ${list.slice(0, -1)}: list at least one ${list.slice(0, -1)} config in \`${list}\``,
      );
  if (agent !== undefined)
    problems.push(
      `deployment ${deployment} has an \`agent\` block: an agent config is a file of its own, listed in \`agents\``,
    );

  if (problems.length)
    throw new Error(
      `deployment ${deployment} is invalid:\n- ${problems.join("\n- ")}`,
    );
}
