import { defineModel } from "@mku1tra/que-harness";

export default defineModel({
  name: "whole-model",
  type: "model",
  description: "The model of a fixture's whole agent.",
  id: "fireworks:whole-model",
  window: 40_000,
  maxTokens: 8_000,
  price: { input: 1, output: 2 },
});
