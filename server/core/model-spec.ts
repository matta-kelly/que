/**
 * The contract for a model config: one model a deployment's agents can run
 * on. A model is a file of its own, and a deployment lists it. The file holds
 * the choices: a name, the provider's own name for the model, and how much it
 * may give in one reply. What is true of the model (how much it takes in, and
 * what it costs) is a fact: the file can write one, and what it leaves out is
 * filled in when the deployment is mounted. Framework-free, as the package
 * contract is.
 */

import * as z from "zod";
import { check, isCount, name, named, strict, that } from "./check.js";

const aboveWindow = (maxTokens: number, window: number) =>
  `must not be above its window, got ${maxTokens} and ${window}`;

const isAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const count = that(isCount, "a whole number above zero");
const amount = that(isAmount, "a number of zero or more");

/** What a model costs, in dollars for one million tokens. */
export const ModelPrice = z.strictObject(
  {
    input: amount,
    output: amount,
    /** Tokens in that the provider read from its cache. Left out: they cost as `input`. */
    cachedInput: amount.optional(),
  },
  strict(),
);

export type ModelPrice = z.infer<typeof ModelPrice>;

/** What `defineModel` returns, and a model file exports as its default. */
export const ModelDefinition = z
  .strictObject(
    {
      /** What an agent config or a run names to get this model. */
      name,
      /** The provider's model, in "provider:model" form. */
      id: that(
        (id): id is string =>
          typeof id === "string" && /^[^:\s]+:\S+$/.test(id),
        'in "provider:model" form',
      ),
      /** The most tokens the model gives in one reply. A choice: not above the window, and not the most the model can give. */
      maxTokens: count,
      /** The most tokens the model takes in. Left out: read from the provider at mount. */
      window: count.optional(),
      /** Left out: read from a model database at mount. */
      price: ModelPrice.optional(),
      /**
       * How hard the model thinks before it answers: the provider's own word for
       * a level, sent as `reasoning_effort` (Beam: low, medium, high, xhigh, max).
       * A choice. Left out: none is sent, and the model thinks at its provider's default.
       * Which words a provider takes is the provider's to say: a word it does not take fails the first call.
       */
      effort: that(
        (effort): effort is string =>
          typeof effort === "string" && /^\S+$/.test(effort),
        "one word",
      ).optional(),
    },
    strict(),
  )
  .superRefine(({ maxTokens, window }, ctx) => {
    if (isCount(window) && isCount(maxTokens) && maxTokens > window)
      ctx.addIssue({
        code: "custom",
        path: ["maxTokens"],
        message: aboveWindow(maxTokens, window),
      });
  });

export type ModelDefinition = z.infer<typeof ModelDefinition>;

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

/** The provider of a model: the part of its id before the first colon. */
export const providerOf = (model: Pick<ModelDefinition, "id">) =>
  model.id.slice(0, model.id.indexOf(":"));

/** The provider's own name for a model: the part of its id after the first colon. */
export const providerModelOf = (model: Pick<ModelDefinition, "id">) =>
  model.id.slice(model.id.indexOf(":") + 1);

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
      `maxTokens of the model ${definition.name} ${aboveWindow(definition.maxTokens, window)}`,
    );
  return { ...definition, window, price };
}

/**
 * Check a model against the contract, throwing one error that lists every
 * problem. Types can't catch these: a model is loaded at runtime.
 */
export function validateModel(def: unknown): asserts def is ModelDefinition {
  check(ModelDefinition, def, `model${named(def)} is invalid`);
}
