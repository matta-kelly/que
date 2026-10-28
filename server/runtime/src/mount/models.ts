/**
 * Mount: make each of a deployment's models whole. A model file holds choices; what it does not write of the model's
 * window and price is asked of the sources (the provider, and a model database), and given as a second piece of its
 * node, so the lint checks the model it ends with. A model of a provider que has no chat model for fails mounting, and
 * so does a model with no window or no price from any place.
 */

import { providerOf, type Model, type Placed } from "@mku1tra/que-harness";
import { beamWindow } from "./model-facts/beam.js";
import { fireworksWindow, type WindowAnswer } from "./model-facts/fireworks.js";
import type { FactSources } from "./model-facts/index.js";

/**
 * The providers que has a chat model for, and for each one where its facts
 * are: how the window of one of its models is read, and its name in the model
 * database. Another provider is a chat model added to the harness (the
 * framework's package, or one of que's own in `run/`, as Beam's is), and an
 * entry here.
 */
export const PROVIDERS: Record<
  string,
  {
    window(
      model: string,
      env: Record<string, string | undefined>,
      fetch: typeof globalThis.fetch,
    ): Promise<WindowAnswer>;
    modelsDev: string;
  }
> = {
  fireworks: {
    window: (model, env, fetch) =>
      fireworksWindow(model, env.FIREWORKS_API_KEY, fetch),
    modelsDev: "fireworks-ai",
  },
  beam: {
    window: (model, env, fetch) => beamWindow(model, env.BEAM_API_KEY, fetch),
    modelsDev: "reflection",
  },
};

/**
 * The facts of each model that its file does not write, as pieces of its node: the window from its provider, and the
 * price from a model database (FactSources). A source is asked only for what the file does not write. Throws, naming
 * the model, on a provider que has no chat model for, and on a fact no source gives.
 */
export async function factPieces(
  models: Placed<Model>[],
  sources: FactSources,
): Promise<{ path: string; name: string; fields: Record<string, unknown> }[]> {
  for (const { node: model } of models)
    if (!Object.hasOwn(PROVIDERS, providerOf(model)))
      throw new Error(
        `mount: the model "${model.name}" has the provider "${providerOf(model)}", which que does not have. Providers: ${Object.keys(PROVIDERS).join(", ")}`,
      );
  const pieces = [];
  try {
    for (const { file, node: model } of models) {
      const facts: Record<string, unknown> = {};
      const none = (fact: "window" | "price", reason: string) =>
        new Error(
          `mount: the model "${model.name}" has no ${fact}: ${reason}, and none is in its file or in the saved copy. Write \`${fact}\` in the model file`,
        );
      if (model.window === undefined) {
        const answer = await sources.window(model);
        if ("reason" in answer) throw none("window", answer.reason);
        facts.window = answer.window;
      }
      if (model.price === undefined) {
        const answer = await sources.price(model);
        if ("reason" in answer) throw none("price", answer.reason);
        facts.price = answer.price;
      }
      if (Object.keys(facts).length)
        pieces.push({
          path: `${file}#facts`,
          name: model.name,
          fields: { type: "model", ...facts },
        });
    }
  } finally {
    // Also when a model stops mount: what a source gave before that is kept for the next start.
    await sources.done();
  }
  return pieces;
}
