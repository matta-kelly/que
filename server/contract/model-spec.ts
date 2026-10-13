/**
 * The contract for a model config: one model a deployment's agents can run
 * on. It has a name, and holds what is true of the model: the provider's own
 * name for it, how much it takes in, and how much it gives in one reply. A
 * model is a file of its own, and a deployment lists it. Framework-free, as
 * the package contract is.
 */

import { NAME } from "./package-spec.js";

/** What `defineModel` returns, and a model file exports as its default. */
export type ModelDefinition = {
  /** What an agent config or a run names to get this model. */
  name: string;
  /** The provider's model, in "provider:model" form. */
  id: string;
  /** The most tokens the model takes in. */
  window: number;
  /** The most tokens the model gives in one reply. */
  maxTokens: number;
};

export function defineModel(definition: ModelDefinition): ModelDefinition {
  return definition;
}

const FIELDS = ["name", "id", "window", "maxTokens"];

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

/** The provider of a model: the part of its id before the first colon. */
export const providerOf = (model: Pick<ModelDefinition, "id">) =>
  model.id.slice(0, model.id.indexOf(":"));

/**
 * Check a model against the contract, throwing one error that lists every
 * problem. Types can't catch these: a model is loaded at runtime.
 */
export function validateModel(def: unknown): asserts def is ModelDefinition {
  if (!def || typeof def !== "object" || Array.isArray(def))
    throw new Error("model must be an object");
  const { name, id, window, maxTokens } = def as Record<string, unknown>;
  const problems: string[] = [];
  const named = typeof name === "string" && NAME.test(name);

  if (typeof name !== "string" || !name.trim())
    problems.push("name of the model is missing");
  else if (!named) problems.push(`model name "${name}" must match ${NAME}`);
  for (const field of Object.keys(def))
    if (!FIELDS.includes(field))
      problems.push(`the model has no field "${field}"`);
  if (typeof id !== "string" || !/^[^:\s]+:\S+$/.test(id))
    problems.push(
      `id of the model must be in "provider:model" form, got ${JSON.stringify(id)}`,
    );
  for (const [field, value] of Object.entries({ window, maxTokens }))
    if (!isCount(value))
      problems.push(
        `${field} of the model must be a whole number above zero, got ${JSON.stringify(value)}`,
      );
  if (isCount(window) && isCount(maxTokens) && maxTokens > window)
    problems.push(
      `maxTokens of the model must not be above its window, got ${maxTokens} and ${window}`,
    );

  if (problems.length)
    throw new Error(
      `model${named ? ` ${name}` : ""} is invalid:\n- ${problems.join("\n- ")}`,
    );
}
