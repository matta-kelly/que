import { defineModel } from "@mku1tra/que-harness";

export default defineModel({
  name: "calm",
  type: "model",
  description: "A model of a fixture that thinks with the effort low.",
  id: "fireworks:calm-model",
  window: 64_000,
  maxTokens: 8_000,
  effort: "low",
});
