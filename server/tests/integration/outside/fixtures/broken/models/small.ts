import { defineModel } from "@que/core";

export default defineModel({
  name: "small",
  id: "fireworks:small-model",
  window: 64_000,
  maxTokens: 8_000,
  price: { input: 1, output: 2 },
});
