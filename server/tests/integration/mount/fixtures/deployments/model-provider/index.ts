import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "model-provider",
  type: "deployment",
  description: "The model-provider deployment of a fixture.",
  plugins: ["gamma", "alpha"],
  agents: ["bare"],
  loops: ["long-chat"],
  models: ["elsewhere"],
});
