import { defineLoop } from "@mku1tra/que-harness";

export default defineLoop({
  name: "early-summary",
  type: "loop",
  description:
    "A loop of a fixture that summarizes at half of the window and keeps a quarter.",
  result: false,
  summarize: { at: 0.5, keep: 0.25 },
});
