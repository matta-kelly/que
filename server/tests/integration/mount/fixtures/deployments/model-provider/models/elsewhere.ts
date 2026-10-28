import { defineModel } from "@mku1tra/que-harness";

export default defineModel({
  name: "elsewhere",
  type: "model",
  description: "The elsewhere model of a fixture.",
  id: "nowhere:some-model",
  window: 64_000,
  maxTokens: 8_000,
  price: { input: 1, output: 2 },
});
