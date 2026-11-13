import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "old-layout-deployment",
  type: "deployment",
  description: "The old-layout-deployment deployment of a fixture.",
  plugins: ["old-layout"],
});
