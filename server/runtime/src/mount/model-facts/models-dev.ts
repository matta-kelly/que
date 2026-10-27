/**
 * A fact from a public model database: the price of a model, read from
 * models.dev. No provider gives its price as data, and this is where tools
 * read it. One HTTP call for every model of a mount, made when the first
 * price is asked for. It gives a price or a reason in words, and does not
 * throw.
 */

import type { ModelPrice } from "@mku1tra/que-harness";

export type PriceAnswer = { price: ModelPrice } | { reason: string };

const ENDPOINT = "https://models.dev/api.json";
const TIMEOUT_MS = 5_000;

type Database = Record<
  string,
  { models?: Record<string, { cost?: Record<string, unknown> }> } | undefined
>;

const isAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/** `provider` is the database's name for it, and `model` the provider's own name for the model. */
export function modelsDevPrices(
  fetch: typeof globalThis.fetch,
): (provider: string, model: string) => Promise<PriceAnswer> {
  let asked: Promise<{ database: Database } | { reason: string }> | undefined;
  const database = () =>
    (asked ??= (async () => {
      try {
        const res = await fetch(ENDPOINT, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) return { reason: `models.dev answered ${res.status}` };
        return { database: ((await res.json()) ?? {}) as Database };
      } catch (error) {
        return {
          reason: `models.dev did not answer: ${(error as Error).message}`,
        };
      }
    })());

  return async (provider, model) => {
    const all = await database();
    if ("reason" in all) return all;
    const entry = all.database[provider]?.models?.[model];
    if (!entry)
      return {
        reason: `models.dev has no model ${JSON.stringify(model)} of ${JSON.stringify(provider)}`,
      };
    const { input, output, cache_read: cachedInput } = entry.cost ?? {};
    if (!isAmount(input) || !isAmount(output))
      return {
        reason: `models.dev has no price for ${JSON.stringify(model)} of ${JSON.stringify(provider)}`,
      };
    return {
      price: {
        input,
        output,
        ...(isAmount(cachedInput) && { cachedInput }),
      },
    };
  };
}
