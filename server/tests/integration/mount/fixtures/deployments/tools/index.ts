import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "tools",
  type: "deployment",
  description: "A deployment of a fixture whose agent has a plugin with an op.",
  plugins: ["till"],
  agents: ["clerk"],
  loops: ["long-chat"],
  models: ["small"],
});
