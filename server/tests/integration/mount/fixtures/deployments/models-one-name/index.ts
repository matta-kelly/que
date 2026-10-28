import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "models-one-name",
  type: "deployment",
  description: "The models-one-name deployment of a fixture.",
  plugins: ["gamma", "alpha"],
  agents: ["bare"],
  loops: ["long-chat"],
  models: ["small", "small"],
});
