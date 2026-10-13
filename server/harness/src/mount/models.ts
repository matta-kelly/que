/**
 * Mount: read a deployment's model configs at startup. A model that breaks
 * the contract (validateModel in @que/core) fails mounting, and so do two of
 * one name, and a model of a provider que has no package for.
 */

import { providerOf, validateModel, type ModelDefinition } from "@que/core";
import { mountFiles } from "./files.js";

/** The providers que has the framework's package for. Another one is a package added to the harness. */
export const PROVIDERS = ["fireworks"];

export async function mountModels(files: string[]): Promise<ModelDefinition[]> {
  const models = await mountFiles(files, "model", validateModel);
  for (const model of models) {
    if (!PROVIDERS.includes(providerOf(model)))
      throw new Error(
        `mount: the model "${model.name}" has the provider "${providerOf(model)}", which que does not have. Providers: ${PROVIDERS.join(", ")}`,
      );
  }
  return models;
}
