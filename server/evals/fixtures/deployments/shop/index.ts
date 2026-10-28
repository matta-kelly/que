import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "shop-deployment",
  type: "deployment",
  description: "The shop-deployment deployment of a fixture.",
  plugins: ["shop", "notes"],
  agents: ["chat", "lean", "notes-only"],
  loops: ["long-chat"],
  models: ["small", "big"],
});
