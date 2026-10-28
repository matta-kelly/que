import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "case-elsewhere",
  type: "deployment",
  description: "The case-elsewhere deployment of a fixture.",
  plugins: ["holder", "stranger"],
  agents: ["bare"],
  loops: ["long-chat"],
  models: ["small"],
});
