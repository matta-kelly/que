import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "prompt",
  type: "deployment",
  description:
    "A deployment of a fixture with two eager agents and one on demand: the first uses the till and a plugin with a skill, and takes the user's own instructions; the second uses source (an op and a skill), on instructions of its own. No op is in both clerk's and keeper's plugins. The third, scout, is on clerk's plugins and loads each op on demand.",
  plugins: ["till", "alpha", "source"],
  agents: ["clerk", "keeper", "scout"],
  loops: ["long-chat"],
  models: ["small"],
});
