import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "capability-twice",
  type: "deployment",
  description: "The capability-twice deployment of a fixture.",
  plugins: ["shop", "shop-twin"],
  agents: ["chat"],
  loops: ["long-chat"],
  models: ["small"],
});
