import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "prompt",
  type: "deployment",
  description:
    "A deployment of a fixture with two eager agents: the first uses the till and a plugin with a skill, and takes the user's own instructions; the second uses the till, on instructions of its own.",
  plugins: ["till", "alpha"],
  agents: ["clerk", "keeper"],
  loops: ["long-chat"],
  models: ["small"],
});
