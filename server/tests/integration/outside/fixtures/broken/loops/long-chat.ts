import { defineLoop } from "@mku1tra/que-harness";

export default defineLoop({
  name: "long-chat",
  type: "loop",
  description: "The long-chat loop of a fixture.",
  summarize: { at: 0.7 },
});
