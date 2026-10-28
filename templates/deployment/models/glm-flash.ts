import { defineModel } from "@mku1tra/que-harness";

// One model this deployment's agents can run on: a file of its own in models/, which the deployment names. These fields
// are the choices, and each is needed.
// que fills in what is true of the model when it starts: its `window` from the provider, and its `price`
// from models.dev. Write `window` or `price` here to pin one: a value in this file wins.
export default defineModel({
  name: "glm-flash",
  type: "model",
  description: "GLM 5.3 Flash, on Fireworks.",
  // The provider's model, as "provider:model". The provider is one que has the package for.
  id: "fireworks:accounts/fireworks/models/glm-5p3-flash",
  // The most tokens the model may give in one reply.
  maxTokens: 131_072,
});
