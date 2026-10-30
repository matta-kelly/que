import { defineModel } from "@mku1tra/que-harness";

// One model this deployment's agents can run on: a file of its own in models/, which the deployment names. These fields
// are the choices, and each is needed. What is true of the model, its window and its price, is not written here: pi's
// model catalog (@earendil-works/pi-ai) gives them, by the id, and a fact has one place. A model the catalog has no
// entry for writes them here.
export default defineModel({
  name: "glm-flash",
  type: "model",
  description: "GLM 5.3 Flash, on Fireworks.",
  // The provider's model, as "provider:model". The provider is one que serves: fireworks.
  id: "fireworks:accounts/fireworks/models/glm-5p3-flash",
  // The most tokens the model may give in one reply.
  maxTokens: 131_072,
});
