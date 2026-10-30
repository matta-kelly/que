import { defineLoop } from "@mku1tra/que-harness";

export default defineLoop({
  name: "no-summary",
  type: "loop",
  description: "A loop of a fixture that does not summarize.",
  result: false,
  summarize: false,
});
