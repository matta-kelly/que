import { defineModel } from "@mku1tra/que-harness";

export default defineModel({
  name: "small",
  type: "model",
  description: "The small model of a fixture.",
  id: "fireworks:accounts/fireworks/models/small-model",
  window: 128_000,
  maxTokens: 8_000,
});
