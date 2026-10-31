import { definePlugin } from "@mku1tra/que-plugin";

export default definePlugin({
  name: "alpha-domain",
  type: "plugin",
  kind: "domain",
  title: "Alpha domain",
  description:
    "The test domain of alpha: alpha holds no op, so its skill lists none, and reaching the domain reaches alpha as the connector that holds it.",
  usesSkills: ["alpha-greet"],
});
