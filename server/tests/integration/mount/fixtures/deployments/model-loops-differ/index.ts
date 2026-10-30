import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "model-loops-differ",
  type: "deployment",
  description:
    "A deployment of a fixture with two agents on one model whose loops summarize at different shares of its window.",
  plugins: ["alpha"],
  agents: ["teller", "auditor"],
  loops: ["long-chat", "short-chat"],
  models: ["small"],
});
