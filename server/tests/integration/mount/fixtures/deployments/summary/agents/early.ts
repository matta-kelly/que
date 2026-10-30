import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "early",
  type: "agent",
  description:
    "The agent of a fixture that summarizes early, on the small model.",
  plugins: ["ledger"],
  model: "small",
  loop: "early-summary",
  loading: "eager",
});
