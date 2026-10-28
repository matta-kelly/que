import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "bad-deployment",
  type: "deployment",
  description: "The bad-deployment deployment of a fixture.",
  plugins: ["bad"],
  agents: ["bare"],
  loops: ["long-chat"],
  models: ["small"],
});
