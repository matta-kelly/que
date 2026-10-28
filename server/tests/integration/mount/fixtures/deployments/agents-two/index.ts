import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "agents-two",
  type: "deployment",
  description: "The agents-two deployment of a fixture.",
  plugins: ["gamma", "alpha"],
  agents: ["chat", "lean"],
  loops: ["long-chat"],
  models: ["small"],
});
