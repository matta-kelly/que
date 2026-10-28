import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "agent-loop-unlisted",
  type: "deployment",
  description: "The agent-loop-unlisted deployment of a fixture.",
  plugins: ["gamma", "alpha"],
  agents: ["looped"],
  loops: ["short-run"],
  models: ["small"],
});
