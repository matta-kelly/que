import { defineLoop } from "@que/core";

// For a run with one job and no person: it sees more of each result, is not
// summarized, and stops sooner when it does not finish.
export default defineLoop({
  name: "short-run",
  result: { max: 60_000 },
  summarize: false,
  limits: { modelCalls: 15 },
});
