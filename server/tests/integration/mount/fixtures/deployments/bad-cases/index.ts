import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "bad-cases-deployment",
  type: "deployment",
  description: "The bad-cases-deployment deployment of a fixture.",
  plugins: ["bad-cases"],
  agents: ["bare"],
  loops: ["long-chat"],
  models: ["small"],
});
