import { defineModel } from "@que/core";

// A second model, with another window and another price than the first.
export default defineModel({
  name: "glm-flash",
  id: "fireworks:accounts/que/models/stand-in-flash",
  maxTokens: 8_000,
  window: 1_000_000,
  price: { input: 0.15, output: 0.5 },
});
