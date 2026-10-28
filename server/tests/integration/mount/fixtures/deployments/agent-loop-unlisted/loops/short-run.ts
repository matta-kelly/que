import { defineLoop } from "@mku1tra/que-harness";

export default defineLoop({
  name: "short-run",
  type: "loop",
  description: "The short-run loop of a fixture.",
  result: { max: 60_000 },
  summarize: false,
});
