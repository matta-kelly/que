import { defineLoop } from "@mku1tra/que-harness";

export default defineLoop({
  name: "short-chat",
  type: "loop",
  description:
    "The short-chat loop of a fixture: it summarizes earlier than long-chat.",
  summarize: { at: 0.5 },
});
