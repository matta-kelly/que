import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "outside",
  type: "deployment",
  description: "The outside deployment of a fixture.",
  plugins: ["notes"],
  agents: ["bare"],
  loops: ["long-chat"],
  models: ["small"],
});
