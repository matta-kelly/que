import { defineModel } from "@mku1tra/que-harness";

export default defineModel({
  name: "big",
  id: "fireworks:accounts/fireworks/models/big-model",
  window: 1_000_000,
  maxTokens: 64_000,
});
