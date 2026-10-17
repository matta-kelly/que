/**
 * The contract for a model config: one model a deployment's agents can run
 * on. A model is a file of its own, and a deployment lists it. The file holds
 * the choices: a name, the provider's own name for the model, and how much it
 * may give in one reply. What is true of the model (how much it takes in, and
 * what it costs) is a fact: the file can write one, and what it leaves out is
 * filled in when the deployment is mounted. Framework-free, as the package
 * contract is.
 */

import { NAME } from "./package-spec.js";

/** What a model costs, in dollars for one million tokens. */
export type ModelPrice = {
  input: number;
  output: number;
  /** Tokens in that the provider read from its cache. Left out: they cost as `input`. */
  cachedInput?: number;
};

/** What `defineModel` returns, and a model file exports as its default. */
export type ModelDefinition = {
  /** What an agent config or a run names to get this model. */
  name: string;
  /** The provider's model, in "provider:model" form. */
  id: string;
  /** The most tokens the model gives in one reply. A choice: not above the window, and not the most the model can give. */
  maxTokens: number;
  /** The most tokens the model takes in. Left out: read from the provider at mount. */
  window?: number;
  /** Left out: read from a model database at mount. */
  price?: ModelPrice;
};

/** What is true of a model, as a source outside the file gives it. */
export type ModelFacts = { window?: number; price?: ModelPrice };

/** A model with every field: what a deployment's models are once mounted. */
export type MountedModel = ModelDefinition & {
  window: number;
  price: ModelPrice;
};

export function defineModel(definition: ModelDefinition): ModelDefinition {
  return definition;
}

const FIELDS = ["name", "id", "window", "maxTokens", "price"];
const PRICE_FIELDS = ["input", "output", "cachedInput"];

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;
const isAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/** The provider of a model: the part of its id before the first colon. */
export const providerOf = (model: Pick<ModelDefinition, "id">) =>
  model.id.slice(0, model.id.indexOf(":"));

/** The provider's own name for a model: the part of its id after the first colon. */
export const providerModelOf = (model: Pick<ModelDefinition, "id">) =>
  model.id.slice(model.id.indexOf(":") + 1);

const aboveWindow = (name: string, maxTokens: number, window: number) =>
  `maxTokens of the model${name} must not be above its window, got ${maxTokens} and ${window}`;

/**
 * A model with every field: each value of its file, and a fact where the file
 * has none. Throws when a fact is in neither, and when the file's `maxTokens`
 * does not fit in the window the model ends with.
 */
export function mountedModel(
  definition: ModelDefinition,
  facts: ModelFacts,
): MountedModel {
  const window = definition.window ?? facts.window;
  const price = definition.price ?? facts.price;
  if (window === undefined)
    throw new Error(`model ${definition.name} has no window`);
  if (price === undefined)
    throw new Error(`model ${definition.name} has no price`);
  if (definition.maxTokens > window)
    throw new Error(
      aboveWindow(` ${definition.name}`, definition.maxTokens, window),
    );
  return { ...definition, window, price };
}

/**
 * Check a model against the contract, throwing one error that lists every
 * problem. Types can't catch these: a model is loaded at runtime.
 */
export function validateModel(def: unknown): asserts def is ModelDefinition {
  if (!def || typeof def !== "object" || Array.isArray(def))
    throw new Error("model must be an object");
  const { name, id, window, maxTokens, price } = def as Record<string, unknown>;
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
  // `window` is a fact the file can leave out; `maxTokens` is a choice it cannot.
  const counts = { maxTokens, ...(window !== undefined && { window }) };
  for (const [field, value] of Object.entries(counts))
    if (!isCount(value))
      problems.push(
        `${field} of the model must be a whole number above zero, got ${JSON.stringify(value)}`,
      );
  if (isCount(window) && isCount(maxTokens) && maxTokens > window)
    problems.push(aboveWindow("", maxTokens, window));
  if (price !== undefined) {
    if (!price || typeof price !== "object" || Array.isArray(price))
      problems.push(
        `price of the model must be an object, got ${JSON.stringify(price)}`,
      );
    else {
      const parts = price as Record<string, unknown>;
      for (const field of Object.keys(parts))
        if (!PRICE_FIELDS.includes(field))
          problems.push(`the price of the model has no field "${field}"`);
      for (const field of PRICE_FIELDS)
        if (
          !isAmount(parts[field]) &&
          !(field === "cachedInput" && parts[field] === undefined)
        )
          problems.push(
            `price.${field} of the model must be a number of zero or more, got ${JSON.stringify(parts[field])}`,
          );
    }
  }

  if (problems.length)
    throw new Error(
      `model${named ? ` ${name}` : ""} is invalid:\n- ${problems.join("\n- ")}`,
    );
}
