import { defineModel } from "@que/core";

// Beam, Reflection's model. To run on it, list this file in `models` in index.ts, and set BEAM_API_KEY in
// the .env. que fills in its `window` from Reflection, and its `price` from models.dev.
export default defineModel({
  name: "beam",
  id: "beam:Beam-1.0-501B-A23B",
  // The most tokens the model may give in one reply: the most Beam gives.
  maxTokens: 131_072,
  // How hard it thinks: low, medium, high, xhigh or max. Left out, Beam thinks at max, its default, which is slow.
  effort: "high",
});
