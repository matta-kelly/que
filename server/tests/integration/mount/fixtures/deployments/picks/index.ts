import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "picks",
  type: "deployment",
  description:
    "A deployment of a fixture with two agents on two models: the first uses the till on the small model, the second has no plugin and runs on the big one.",
  plugins: ["till"],
  agents: ["clerk", "lean"],
  loops: ["long-chat"],
  models: ["small", "big"],
});
