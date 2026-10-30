import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "roomy",
  type: "agent",
  description:
    "The agent of a fixture that keeps much of its chat when it summarizes.",
  plugins: ["ledger"],
  model: "roomy-model",
  loop: "roomy-summary",
  loading: "eager",
});
