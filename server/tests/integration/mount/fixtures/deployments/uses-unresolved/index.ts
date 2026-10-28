import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "uses-unresolved",
  type: "deployment",
  description: "The uses-unresolved deployment of a fixture.",
  plugins: ["source", "stray"],
  agents: ["bare"],
  loops: ["long-chat"],
  models: ["small"],
});
