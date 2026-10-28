import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "agent-names-unmounted",
  type: "deployment",
  description: "The agent-names-unmounted deployment of a fixture.",
  plugins: ["alpha"],
  agents: ["wants-delta"],
  loops: ["long-chat"],
  models: ["small"],
});
