import { defineModel } from "@mku1tra/que-harness";

// Beam, Reflection's model. To run on it, name it in `models` in index.ts, and set BEAM_API_KEY in the .env.
// pi's model catalog has no entry for Beam, so its facts are written here, in their one place.
export default defineModel({
  name: "beam",
  type: "model",
  description: "Beam, Reflection's model.",
  id: "beam:Beam-1.0-501B-A23B",
  // The most tokens the model takes in: its context_length, as Reflection gives it
  // (https://developers.reflection.ai/models.md).
  window: 1_048_576,
  // No price: Reflection publishes none, so the chat shows no cost for Beam.
  // The most tokens the model may give in one reply: the most Beam gives.
  maxTokens: 131_072,
  // How hard it thinks: low, medium, high, xhigh or max. Left out, Beam thinks at max, its default, which is slow.
  effort: "high",
});
