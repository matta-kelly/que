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
import { ModelPrice } from "@que/ontology/harness";
import { check, isCount, named, standardName, strict } from "./check.js";
import { fieldsOf, types } from "./ontology.js";

export { ModelPrice };
export type ModelPrice = z.infer<typeof ModelPrice>;

const aboveWindow = (maxTokens: number, window: number) =>
  `must not be above its window, got ${maxTokens} and ${window}`;

/** What `defineModel` returns, and a model file exports as its default. */
export const ModelDefinition = z
  .strictObject(
    {
      /** What an agent config or a run names to get this model. */
      name: standardName,
      ...fieldsOf(types.model),
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
