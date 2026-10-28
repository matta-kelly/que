import { defineDeployment } from "@mku1tra/que-harness";

// Breaks the contract on purpose: a deployment names at least one model.
export default defineDeployment({
  name: "models-none",
  type: "deployment",
  description: "The models-none deployment of a fixture.",
  plugins: ["alpha"],
  agents: ["bare"],
  loops: ["long-chat"],
  models: [],
});
