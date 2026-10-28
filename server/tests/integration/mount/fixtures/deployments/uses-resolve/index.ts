import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "uses-resolve",
  type: "deployment",
  description: "The uses-resolve deployment of a fixture.",
  plugins: ["source", "domain"],
  agents: ["bare"],
  loops: ["long-chat"],
  models: ["small"],
});
