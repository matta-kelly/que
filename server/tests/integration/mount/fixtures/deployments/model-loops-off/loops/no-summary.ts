import { defineLoop } from "@mku1tra/que-harness";

export default defineLoop({
  name: "no-summary",
  type: "loop",
  description: "The no-summary loop of a fixture: it does not summarize.",
  summarize: false,
});
