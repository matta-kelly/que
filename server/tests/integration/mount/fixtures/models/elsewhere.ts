import { defineModel } from "@mku1tra/que-harness";

export default defineModel({
  name: "elsewhere",
  id: "nowhere:some-model",
  window: 64_000,
  maxTokens: 8_000,
  price: { input: 1, output: 2 },
});
