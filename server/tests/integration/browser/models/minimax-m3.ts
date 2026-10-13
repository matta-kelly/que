import { defineModel } from "@que/core";

// Named as que's chat agents name their model. The window and the price are
// written here, so mount asks no provider and no model database.
export default defineModel({
  name: "minimax-m3",
  id: "fireworks:accounts/que/models/stand-in",
  maxTokens: 8_000,
  window: 200_000,
  price: { input: 0.3, output: 1.2 },
});
