import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "whole",
  type: "agent",
  description: "The agent of a fixture that does not summarize.",
  plugins: ["ledger"],
  model: "whole-model",
  loop: "no-summary",
  loading: "eager",
});
