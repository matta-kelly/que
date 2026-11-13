import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "tools",
  type: "deployment",
  description: "A deployment of a fixture with a plugin with an op.",
  plugins: ["till", "till-domain"],
});
