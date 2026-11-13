import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "missing",
  type: "deployment",
  description: "The missing deployment of a fixture.",
  plugins: ["nope"],
});
