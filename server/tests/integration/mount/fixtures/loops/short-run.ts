import { defineLoop } from "@mku1tra/que-harness";

export default defineLoop({
  name: "short-run",
  result: { max: 60_000 },
  summarize: false,
});
