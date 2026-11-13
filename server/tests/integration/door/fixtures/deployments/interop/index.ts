import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "interop",
  type: "deployment",
  description:
    "A deployment of a fixture whose domain calls a connector op it lists.",
  plugins: ["interop-domain", "interop-connector"],
});
