import { defineLoop } from "@que/core";

// For a chat that goes on: one thread, many questions. It holds que's own
// value for each setting, written out.
export default defineLoop({
  name: "long-chat",
  result: { max: 20_000 },
  summarize: { at: 0.85, keep: 0.1 },
  args: { max: 2_000 },
  limits: { modelCalls: 50, toolCalls: 100 },
});
