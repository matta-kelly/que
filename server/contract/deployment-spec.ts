/**
 * The contract every deployment is written against: its name, the packages
 * it uses, and the agent it runs. Framework-free, as the package contract is.
 */

import { validateAgent, type AgentDefinition } from "./agent-spec.js";
import { NAME } from "./package-spec.js";

/** What `defineDeployment` returns, and a deployment exports as its default. */
export type DeploymentDefinition = {
  name: string;
  /** One folder per package: an absolute path, or one taken from the deployment's own folder. */
  packages: string[];
  /** How the agent runs. Left out, the agent runs on que's own choices. */
  agent?: AgentDefinition;
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
  const { name, packages, agent } = def as Record<string, unknown>;
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

  if (agent !== undefined) {
    try {
      validateAgent(agent);
    } catch (error) {
      // The agent's own list, set one level in under this one.
      problems.push((error as Error).message.replaceAll("\n", "\n  "));
    }
  }

  if (problems.length)
    throw new Error(
      `deployment ${deployment} is invalid:\n- ${problems.join("\n- ")}`,
    );
}
