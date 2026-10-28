import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "fileless-skill-deployment",
  type: "deployment",
  description: "The fileless-skill-deployment deployment of a fixture.",
  plugins: ["fileless-skill"],
  agents: ["bare"],
  loops: ["long-chat"],
  models: ["small"],
});
