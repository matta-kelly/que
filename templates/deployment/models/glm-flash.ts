import { defineModel } from "@que/core";

// One model this deployment's agents can run on. All four fields are needed.
export default defineModel({
  name: "glm-flash",
  // The provider's model, as "provider:model". The provider is one que has the package for.
  id: "fireworks:accounts/fireworks/models/glm-5p3-flash",
  // The most tokens the model takes in.
  window: 1_040_000,
  // The most tokens the model gives in one reply.
  maxTokens: 131_072,
});
