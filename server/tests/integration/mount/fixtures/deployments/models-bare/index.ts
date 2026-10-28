import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "models-bare",
  type: "deployment",
  description: "The models-bare deployment of a fixture.",
  plugins: [],
  agents: ["on-big"],
  loops: ["long-chat"],
  models: ["big", "bare"],
});
