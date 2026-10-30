import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "efforts",
  type: "deployment",
  description:
    "A deployment of a fixture whose agent has no plugin, with three models: two with an effort, and one with none.",
  plugins: [],
  agents: ["plain"],
  loops: ["long-chat"],
  models: ["small", "keen", "calm"],
});
