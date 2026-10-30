import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "model-ids-shared",
  type: "deployment",
  description:
    "A deployment of a fixture with two model entries of one id, fireworks:small-model, each the model of an agent whose loop summarizes at a different share of its window.",
  plugins: ["alpha"],
  agents: ["teller", "auditor"],
  loops: ["long-chat", "short-chat"],
  models: ["small", "small-twin"],
});
