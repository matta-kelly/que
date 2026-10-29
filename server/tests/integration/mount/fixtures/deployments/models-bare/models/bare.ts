import { defineModel } from "@mku1tra/que-harness";

// A model the model catalog has no entry for, whose file writes no window: no piece gives it one.
export default defineModel({
  name: "bare",
  type: "model",
  description: "The bare model of a fixture.",
  id: "fireworks:accounts/fireworks/models/bare-model",
  maxTokens: 8_000,
});
