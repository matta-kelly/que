import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "agent-file-missing",
  type: "deployment",
  description: "The agent-file-missing deployment of a fixture.",
  plugins: ["gamma", "alpha"],
  agents: ["nope"],
  loops: ["long-chat"],
  models: ["small"],
});
