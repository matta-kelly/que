import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "agents-one-name",
  type: "deployment",
  description: "The agents-one-name deployment of a fixture.",
  plugins: ["gamma", "alpha"],
  agents: ["chat", "chat"],
  loops: ["long-chat"],
  models: ["small"],
});
