import { defineModel } from "@mku1tra/que-harness";

export default defineModel({
  name: "big",
  type: "model",
  description: "The big model of a fixture.",
  id: "fireworks:big-model",
  window: 1_000_000,
  maxTokens: 100_000,
  price: { input: 1, output: 2 },
});
