import { defineLoop } from "@mku1tra/que-harness";

export default defineLoop({
  name: "late-summary",
  type: "loop",
  description:
    "A loop of a fixture that summarizes at 0.7 of the window and keeps 0.15.",
  result: false,
  summarize: { at: 0.7, keep: 0.15 },
});
