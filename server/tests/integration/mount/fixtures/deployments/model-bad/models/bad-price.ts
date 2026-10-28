import { defineModel } from "@mku1tra/que-harness";

// A model that breaks the contract: its price is not in the shape.
export default defineModel({
  name: "bad-price",
  type: "model",
  description: "The bad-price model of a fixture.",
  id: "fireworks:small-model",
  maxTokens: 8_000,
  price: { input: "cheap" },
} as never);
