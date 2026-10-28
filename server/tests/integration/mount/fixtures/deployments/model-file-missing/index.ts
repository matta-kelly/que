import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "model-file-missing",
  type: "deployment",
  description: "The model-file-missing deployment of a fixture.",
  plugins: ["gamma", "alpha"],
  agents: ["bare"],
  loops: ["long-chat"],
  models: ["nope"],
});
