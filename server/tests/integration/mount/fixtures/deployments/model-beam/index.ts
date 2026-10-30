import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "model-beam",
  type: "deployment",
  description: "The model-beam deployment of a fixture.",
  plugins: [],
  agents: ["chat"],
  loops: ["long-chat"],
  models: ["beam"],
});
