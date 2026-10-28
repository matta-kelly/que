import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "misnamed-skill-deployment",
  type: "deployment",
  description: "The misnamed-skill-deployment deployment of a fixture.",
  plugins: ["misnamed-skill"],
  agents: ["bare"],
  loops: ["long-chat"],
  models: ["small"],
});
