import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "rows",
  type: "deployment",
  description:
    "A deployment of a fixture whose agent has the domain op that counts a file's rows.",
  plugins: ["rows-domain"],
  agents: ["files"],
  loops: ["long-chat"],
  models: ["small"],
});
