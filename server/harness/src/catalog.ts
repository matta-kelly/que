/**
 * The model catalog: where what is true of a model (its window and its price) comes from, the one place. It is pi's
 * catalog of models, `@earendil-works/pi-ai`, as installed: generated per provider, and read offline, so a model's facts
 * are those of the catalog's version. A model is found by its provider and the provider's own name for it (its id). For
 * a model the catalog has no entry for, its file gives its facts (model.ts).
 */

import {
  getBuiltinModel,
  getBuiltinProviders,
} from "@earendil-works/pi-ai/providers/all";
import {
  providerModelOf,
  providerOf,
  type Model,
  type ModelPrice,
} from "./model.ts";

/** What is true of a model, as the catalog gives it. */
export type ModelFacts = {
  window: number;
  price: ModelPrice;
  input: NonNullable<ReturnType<typeof getBuiltinModel>>["input"];
};

/**
 * The facts of the model whose id is `id`, in "provider:model" form: its window, its price in dollars for one
 * million tokens (a token read from the provider's cache at the catalog's price of one), and the input modalities it
 * takes. None when the catalog has no entry for it.
 */
export function factsOf(id: Model["id"]): ModelFacts | undefined {
  const provider = providerOf({ id });
  const name = providerModelOf({ id });
  if (!(getBuiltinProviders() as string[]).includes(provider)) return undefined;
  const entry = (
    getBuiltinModel as (
      provider: string,
      id: string,
    ) => ReturnType<typeof getBuiltinModel> | undefined
  )(provider, name);
  // An own entry only: a name such as `constructor` is no model.
  if (entry?.id !== name) return undefined;
  return {
    window: entry.contextWindow,
    price: {
      input: entry.cost.input,
      output: entry.cost.output,
      cachedInput: entry.cost.cacheRead,
    },
    input: entry.input,
  };
}
