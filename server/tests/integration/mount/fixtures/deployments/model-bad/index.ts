import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "model-bad",
  type: "deployment",
  description: "The model-bad deployment of a fixture.",
  plugins: ["gamma", "alpha"],
  agents: ["bare"],
  loops: ["long-chat"],
  models: ["bad-price"],
});
