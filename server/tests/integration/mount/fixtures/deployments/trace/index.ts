import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "trace",
  type: "deployment",
  description:
    "A deployment of a fixture whose agent calls the till on its own login and a domain op on its role's.",
  plugins: ["till", "till-domain", "warehouse", "roles-domain"],
  agents: ["clerk"],
  loops: ["long-chat"],
  models: ["small"],
});
