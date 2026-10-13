import { defineLoop } from "@que/core";

export default defineLoop({
  name: "short-run",
  result: { max: 60_000 },
  summarize: false,
});
