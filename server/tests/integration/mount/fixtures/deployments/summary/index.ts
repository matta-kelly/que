import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "summary",
  type: "deployment",
  description:
    "A deployment of a fixture with four agents on the ledger, each on a model and a loop of its own: early summarizes at half of a 40,000-token window and keeps a quarter, late at 0.7 of a 100,000-token window and keeps 0.15, roomy at half of a 40,000-token window and keeps 0.4, and whole does not summarize.",
  plugins: ["ledger"],
  agents: ["early", "late", "roomy", "whole"],
  loops: ["early-summary", "late-summary", "roomy-summary", "no-summary"],
  models: ["small", "wide", "roomy-model", "whole-model"],
});
