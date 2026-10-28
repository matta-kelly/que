import { defineLoop } from "@mku1tra/que-harness";

// A loop that breaks the contract: a limit of no calls.
export default defineLoop({
  name: "endless",
  type: "loop",
  description: "The endless loop of a fixture.",
  limits: { modelCalls: 0 },
});
