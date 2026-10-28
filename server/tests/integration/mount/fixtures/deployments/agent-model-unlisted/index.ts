import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "agent-model-unlisted",
  type: "deployment",
  description: "The agent-model-unlisted deployment of a fixture.",
  plugins: ["gamma", "alpha"],
  agents: ["lean"],
  loops: ["long-chat"],
  models: ["big"],
});
