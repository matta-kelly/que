import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "prompt",
  type: "deployment",
  description:
    "A deployment of a fixture with two eager agents: the first uses the till and a plugin with a skill, and takes the user's own instructions; the second uses source (an op and a skill), on instructions of its own. No op is in both agents' plugins.",
  plugins: ["till", "alpha", "source"],
  agents: ["clerk", "keeper"],
  loops: ["long-chat"],
  models: ["small"],
});
