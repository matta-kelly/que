import { defineModel } from "@mku1tra/que-harness";

export default defineModel({
  name: "wide",
  type: "model",
  description: "The wide model of a fixture.",
  id: "fireworks:wide-model",
  window: 100_000,
  maxTokens: 8_000,
  price: { input: 1, output: 2 },
});
