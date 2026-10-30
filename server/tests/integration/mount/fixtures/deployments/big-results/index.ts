import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "big-results",
  type: "deployment",
  description:
    "A deployment of a fixture whose agent's loop moves any result over 10 tokens to a file.",
  plugins: ["till"],
  agents: ["clerk"],
  loops: ["small-result"],
  models: ["small"],
});
