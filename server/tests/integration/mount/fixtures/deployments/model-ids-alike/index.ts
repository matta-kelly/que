import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "model-ids-alike",
  type: "deployment",
  description:
    "A deployment of a fixture with two model entries of one id, fireworks:small-model, with one window, each the model of an agent on one loop.",
  plugins: ["alpha"],
  agents: ["teller", "auditor"],
  loops: ["long-chat"],
  models: ["small", "small-twin"],
});
