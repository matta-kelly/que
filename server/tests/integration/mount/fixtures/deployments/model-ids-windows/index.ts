import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "model-ids-windows",
  type: "deployment",
  description:
    "A deployment of a fixture with two model entries of one id, fireworks:small-model, that the model catalog does not know, with windows of 64,000 and 32,000 tokens, each the model of an agent on one loop.",
  plugins: ["alpha"],
  agents: ["teller", "auditor"],
  loops: ["long-chat"],
  models: ["small", "small-narrow"],
});
