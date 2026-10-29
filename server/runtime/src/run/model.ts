/**
 * The model a run is built with: the one the run names, then the one its
 * agent config names. que has no model of its own.
 */

import type { Agent, Model } from "@mku1tra/que-harness";

export function modelFor(
  models: Model[],
  config: Agent,
  named: unknown,
): Model {
  const name = named ?? config.model;
  const model = models.find((m) => m.name === name);
  if (model) return model;
  // No fall back to the first: a run on the wrong model would look like a run on the right one.
  throw new Error(
    `no model ${JSON.stringify(name)}. Models: ${models.map((m) => m.name).join(", ")}`,
  );
}
