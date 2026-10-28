import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "agent-bad",
  type: "deployment",
  description: "The agent-bad deployment of a fixture.",
  plugins: ["gamma", "alpha"],
  agents: ["modelless"],
  loops: ["long-chat"],
  models: ["small"],
});
