import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "model-loops-off",
  type: "deployment",
  description:
    "A deployment of a fixture with two agents on one model: one loop summarizes, the other does not.",
  plugins: ["alpha"],
  agents: ["teller", "archivist"],
  loops: ["long-chat", "no-summary"],
  models: ["small"],
});
