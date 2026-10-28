import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "two",
  type: "deployment",
  description: "The two deployment of a fixture.",
  plugins: ["gamma", "alpha"],
  agents: ["bare"],
  loops: ["long-chat"],
  models: ["small"],
});
