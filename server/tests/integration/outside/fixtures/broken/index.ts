import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "broken-outside",
  type: "deployment",
  description: "The broken-outside deployment of a fixture.",
  plugins: ["untitled"],
  agents: ["bare"],
  loops: ["long-chat"],
  models: ["small"],
});
