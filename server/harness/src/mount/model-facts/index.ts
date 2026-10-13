/**
 * Where mount gets what is true of a model that its file does not write: the
 * window from the model's provider, and the price from a model database.
 * Behind each is the saved copy: a fact a source gives is kept for the next
 * start, and a fact a source does not give is read from what an earlier start
 * kept. A fact comes back, or the source's own reason for none.
 */

import { providerModelOf, providerOf, type ModelDefinition } from "@que/core";
import { PROVIDERS } from "../models.js";
import type { WindowAnswer } from "./fireworks.js";
import { modelsDevPrices, type PriceAnswer } from "./models-dev.js";
import { savedFacts, type Saved } from "./saved.js";

/** What mount is handed. A test hands in its own, and so calls no network. */
export type FactSources = {
  window(model: ModelDefinition): Promise<WindowAnswer>;
  price(model: ModelDefinition): Promise<PriceAnswer>;
  /** Mount is done: keep what the sources gave. */
  done(): Promise<void>;
};

export function factSources(
  folder: string,
  env: Record<string, string | undefined>,
  fetch: typeof globalThis.fetch = globalThis.fetch,
): FactSources {
  const saved = savedFacts(folder);
  let kept: Promise<Saved> | undefined;
  const read = () => (kept ??= saved.read());
  const fresh: Saved = {};
  const prices = modelsDevPrices(fetch);
  // Two models of one id are one question.
  const asked = new Map<string, Promise<WindowAnswer | PriceAnswer>>();
  const once = <T extends WindowAnswer | PriceAnswer>(
    key: string,
    ask: () => Promise<T>,
  ) => {
    if (!asked.has(key)) asked.set(key, ask());
    return asked.get(key) as Promise<T>;
  };

  return {
    window: (model) =>
      once(`window ${model.id}`, async () => {
        const answer = await PROVIDERS[providerOf(model)].window(
          providerModelOf(model),
          env,
          fetch,
        );
        if ("window" in answer) {
          (fresh[model.id] ??= {}).window = answer.window;
          return answer;
        }
        const window = (await read())[model.id]?.window;
        return window === undefined ? answer : { window };
      }),
    price: (model) =>
      once(`price ${model.id}`, async () => {
        const answer = await prices(
          PROVIDERS[providerOf(model)].modelsDev,
          providerModelOf(model),
        );
        if ("price" in answer) {
          (fresh[model.id] ??= {}).price = answer.price;
          return answer;
        }
        const price = (await read())[model.id]?.price;
        return price === undefined ? answer : { price };
      }),
    // One write for a mount, and none when no source gave a thing: what is saved is then still the newest.
    async done() {
      if (!Object.keys(fresh).length) return;
      const all = { ...(await saved.read()) };
      for (const [id, facts] of Object.entries(fresh))
        all[id] = { ...all[id], ...facts };
      // The saved copy is a fallback: a folder that cannot be written does not stop a mount that has its facts.
      try {
        await saved.write(all);
      } catch (error) {
        console.warn(
          `mount: the saved copy of the models' facts was not written: ${(error as Error).message}`,
        );
      }
    },
  };
}
