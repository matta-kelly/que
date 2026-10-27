import { defineModel } from "@mku1tra/que-harness";

export default defineModel({
  name: "small",
  id: "fireworks:another-small-model",
  window: 32_000,
  maxTokens: 4_000,
  price: { input: 1, output: 2 },
});
