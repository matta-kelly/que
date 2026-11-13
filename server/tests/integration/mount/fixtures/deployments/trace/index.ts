import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "trace",
  type: "deployment",
  description:
    "A deployment of a fixture whose till runs on its own login and whose domain op runs on its role's.",
  plugins: ["till", "till-domain", "warehouse", "roles-domain"],
});
