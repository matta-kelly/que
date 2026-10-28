import { defineDeployment } from "@mku1tra/que-harness";

// Breaks the contract on purpose: plugins must be a list.
export default defineDeployment({
  name: "broken",
  type: "deployment",
  description: "The broken deployment of a fixture.",
  plugins: "alpha",
  agents: ["bare"],
  loops: ["long-chat"],
  models: ["small"],
} as never);
