import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "models-two",
  type: "deployment",
  description: "The models-two deployment of a fixture.",
  plugins: ["gamma", "alpha"],
  agents: ["bare"],
  loops: ["long-chat"],
  models: ["big", "small"],
});
