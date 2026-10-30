import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "late",
  type: "agent",
  description:
    "The agent of a fixture that summarizes late, on the wide model.",
  plugins: ["ledger"],
  model: "wide",
  loop: "late-summary",
  loading: "eager",
});
