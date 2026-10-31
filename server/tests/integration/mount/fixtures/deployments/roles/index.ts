import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "roles",
  type: "deployment",
  description:
    "The roles deployment of a fixture: a domain that uses an internal connector's role, a second internal connector whose connect fails, and a connector with no roles.",
  plugins: ["warehouse", "roles-domain", "archive", "flaky"],
  agents: ["bare"],
  loops: ["long-chat"],
  models: ["small"],
});
