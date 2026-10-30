import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "roles",
  type: "deployment",
  description:
    "The roles deployment of a fixture: a domain that uses an internal connector's role.",
  plugins: ["warehouse", "roles-domain"],
  agents: ["bare"],
  loops: ["long-chat"],
  models: ["small"],
});
