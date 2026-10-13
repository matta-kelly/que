/**
 * The contract for the agent a deployment runs: which of its packages the
 * agent gets, the model it runs on, its instructions, and its loop policy. Framework-free, as
 * the package contract is.
 */

/** The loop policies que has: what the agent sends the model of a chat that grows. */
export const LOOPS = ["keep-all", "compact"] as const;
export type Loop = (typeof LOOPS)[number];

/** What a deployment writes in `agent`. A field left out keeps que's own value. */
export type AgentDefinition = {
  /** Names of the packages the agent gets, out of the ones the deployment mounts. */
  packages?: string[];
  /** In "provider:model" form. */
  model?: string;
  /** Opens the system prompt, in place of que's own role text. */
  instructions?: string;
  /** The name of a loop policy. */
  loop?: Loop;
};

const FIELDS = ["packages", "model", "instructions", "loop"];

/**
 * Check a config against the contract, throwing one error that lists every
 * problem. Types can't catch these: a deployment is loaded at runtime.
 */
export function validateAgent(def: unknown): asserts def is AgentDefinition {
  if (!def || typeof def !== "object" || Array.isArray(def))
    throw new Error("agent must be an object");
  const { packages, model, instructions, loop } = def as Record<
    string,
    unknown
  >;
  const problems: string[] = [];
  const text = (value: unknown, what: string) => {
    if (value !== undefined && (typeof value !== "string" || !value.trim()))
      problems.push(`${what} of the agent is empty`);
  };

  for (const field of Object.keys(def))
    if (!FIELDS.includes(field))
      problems.push(`the agent has no field "${field}"`);
  if (packages !== undefined && !Array.isArray(packages))
    problems.push("packages of the agent must be an array");
  for (const name of Array.isArray(packages) ? packages : []) {
    if (typeof name !== "string" || !name.trim())
      problems.push(
        `packages of the agent must each be a package name, got ${JSON.stringify(name)}`,
      );
  }
  text(model, "model");
  text(instructions, "instructions");
  if (loop !== undefined && !LOOPS.includes(loop as Loop))
    problems.push(
      `loop of the agent must be one of ${LOOPS.join(", ")}, got ${JSON.stringify(loop)}`,
    );

  if (problems.length)
    throw new Error(`agent is invalid:\n- ${problems.join("\n- ")}`);
}
