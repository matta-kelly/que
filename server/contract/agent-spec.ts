/**
 * The contract for an agent config: one way a deployment's packages are run.
 * It has a name, and says which packages the agent gets, the model it runs
 * on, its instructions, how it is shown the environment, and the loop it
 * runs in. A config is a
 * file of its own, and a deployment lists it. Framework-free, as the package
 * contract is.
 */

import { NAME } from "./package-spec.js";

/** The ways que has of showing the model its environment. A config names one. */
export const LEGIBILITY = ["on-demand"] as const;
export type Legibility = (typeof LEGIBILITY)[number];

/** What `defineAgent` returns, and an agent file exports as its default. A field left out keeps que's own value. */
export type AgentDefinition = {
  /** What a run names to get this config. */
  name: string;
  /** Names of the packages the agent gets, out of the ones the deployment mounts. */
  packages?: string[];
  /** The name of a model config the deployment lists. */
  model?: string;
  /** Opens the system prompt, in place of que's own role text. */
  instructions?: string;
  /** How the model is shown the environment, and when. */
  legibility?: Legibility;
  /** The name of a loop config the deployment lists: how the agent's loop is run. */
  loop?: string;
};

export function defineAgent(definition: AgentDefinition): AgentDefinition {
  return definition;
}

const FIELDS = [
  "name",
  "packages",
  "model",
  "instructions",
  "legibility",
  "loop",
];

/**
 * Check a config against the contract, throwing one error that lists every
 * problem. Types can't catch these: a config is loaded at runtime.
 */
export function validateAgent(def: unknown): asserts def is AgentDefinition {
  if (!def || typeof def !== "object" || Array.isArray(def))
    throw new Error("agent must be an object");
  const { name, packages, model, instructions, legibility, loop } =
    def as Record<string, unknown>;
  const problems: string[] = [];
  const text = (value: unknown, what: string) => {
    if (value !== undefined && (typeof value !== "string" || !value.trim()))
      problems.push(`${what} of the agent is empty`);
  };
  const named = typeof name === "string" && NAME.test(name);

  if (typeof name !== "string" || !name.trim())
    problems.push("name of the agent is missing");
  else if (!named) problems.push(`agent name "${name}" must match ${NAME}`);
  for (const field of Object.keys(def))
    if (!FIELDS.includes(field))
      problems.push(`the agent has no field "${field}"`);
  if (packages !== undefined && !Array.isArray(packages))
    problems.push("packages of the agent must be an array");
  for (const pkg of Array.isArray(packages) ? packages : []) {
    if (typeof pkg !== "string" || !pkg.trim())
      problems.push(
        `packages of the agent must each be a package name, got ${JSON.stringify(pkg)}`,
      );
  }
  if (typeof model === "string" && model.includes(":"))
    problems.push(
      `model of the agent is written as "provider:model": a model is a file of its own, listed in \`models\` in the deployment, and the agent names it`,
    );
  else if (
    model !== undefined &&
    (typeof model !== "string" || !NAME.test(model))
  )
    problems.push(
      `model of the agent must be the name of a model, got ${JSON.stringify(model)}`,
    );
  text(instructions, "instructions");
  if (
    legibility !== undefined &&
    !(LEGIBILITY as readonly unknown[]).includes(legibility)
  )
    problems.push(
      `legibility of the agent must be one of: ${LEGIBILITY.join(", ")}, got ${JSON.stringify(legibility)}`,
    );
  if (loop !== undefined && (typeof loop !== "string" || !NAME.test(loop)))
    problems.push(
      `loop of the agent must be the name of a loop, got ${JSON.stringify(loop)}`,
    );

  if (problems.length)
    throw new Error(
      `agent${named ? ` ${name}` : ""} is invalid:\n- ${problems.join("\n- ")}`,
    );
}
