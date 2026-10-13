import { defineModel } from "@que/core";

export default defineModel({
  name: "big",
  id: "fireworks:big-model",
  window: 1_000_000,
  maxTokens: 100_000,
  price: { input: 1, output: 2 },
});
