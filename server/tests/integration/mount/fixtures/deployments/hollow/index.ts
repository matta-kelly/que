import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "hollow-deployment",
  type: "deployment",
  description: "The hollow-deployment deployment of a fixture.",
  plugins: ["hollow"],
  agents: ["bare"],
  loops: ["long-chat"],
  models: ["small"],
});
