import { defineModel } from "@mku1tra/que-harness";

export default defineModel({
  name: "keen",
  type: "model",
  description: "A model of a fixture that thinks with the effort high.",
  id: "fireworks:keen-model",
  window: 64_000,
  maxTokens: 8_000,
  effort: "high",
});
