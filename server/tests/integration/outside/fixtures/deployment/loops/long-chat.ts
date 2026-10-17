import { defineLoop } from "@que/core";

export default defineLoop({
  name: "long-chat",
  summarize: { at: 0.7 },
});
