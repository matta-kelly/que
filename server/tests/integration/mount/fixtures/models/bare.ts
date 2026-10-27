import { defineModel } from "@mku1tra/que-harness";

// A model that writes no fact: its window and its price come from the sources.
export default defineModel({
  name: "bare",
  id: "fireworks:accounts/fireworks/models/bare-model",
  maxTokens: 8_000,
});
