/**
 * The pi model maker: the pi-ai model for a model config, Fireworks on its
 * Chat Completions endpoint.
 *
 * A stub, so its test reaches its assertion: it gives no model yet.
 */

import type { Model as PiModel } from "@earendil-works/pi-ai";
import type { Model } from "@mku1tra/que-harness";

export const piModel = (model: Model): PiModel<"openai-completions"> => {
  void model;
  return {} as PiModel<"openai-completions">;
};
