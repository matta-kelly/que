import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "broken-deployment",
  type: "deployment",
  description: "The broken-deployment deployment of a fixture.",
  plugins: ["broken"],
  agents: ["chat"],
  loops: ["long-chat"],
  models: ["small"],
});
