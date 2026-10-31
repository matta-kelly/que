import { definePlugin } from "@mku1tra/que-plugin";

export default definePlugin({
  name: "till-domain",
  type: "plugin",
  kind: "domain",
  title: "Till domain",
  description:
    "The test domain of the till: its skill lists the till's ops, so reaching the domain reaches the till.",
  usesSkills: ["till-ops"],
});
