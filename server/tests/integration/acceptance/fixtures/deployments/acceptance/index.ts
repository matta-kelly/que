import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "acceptance",
  type: "deployment",
  description:
    "The issue's acceptance deployment: an agent whose domain op counts a file's rows, on an image-capable model.",
  plugins: ["rows-domain"],
  agents: ["files"],
  loops: ["long-chat"],
  models: ["glm"],
});
