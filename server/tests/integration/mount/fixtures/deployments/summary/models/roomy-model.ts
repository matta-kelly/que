import { defineModel } from "@mku1tra/que-harness";

export default defineModel({
  name: "roomy-model",
  type: "model",
  description: "The model of a fixture's roomy agent.",
  id: "fireworks:roomy-model",
  window: 40_000,
  maxTokens: 8_000,
  price: { input: 1, output: 2 },
});
