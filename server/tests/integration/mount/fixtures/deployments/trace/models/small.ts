import { defineModel } from "@mku1tra/que-harness";

export default defineModel({
  name: "small",
  type: "model",
  description: "The small model of a fixture.",
  id: "fireworks:small-model",
  window: 64_000,
  maxTokens: 8_000,
  price: { input: 1, output: 2 },
});
