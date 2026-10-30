import { defineLoop } from "@mku1tra/que-harness";

export default defineLoop({
  name: "long-chat-whole",
  type: "loop",
  description:
    "The long-chat-whole loop of a fixture: it summarizes as long-chat does, and keeps each result whole.",
  result: false,
  summarize: { at: 0.7 },
});
