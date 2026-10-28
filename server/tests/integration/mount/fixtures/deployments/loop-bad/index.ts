import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "loop-bad",
  type: "deployment",
  description: "The loop-bad deployment of a fixture.",
  plugins: ["gamma", "alpha"],
  loops: ["endless"],
  agents: ["bare"],
  models: ["small"],
});
