import { definePlugin } from "@mku1tra/que-plugin";

export default definePlugin({
  name: "stray",
  type: "plugin",
  kind: "domain",
  title: "Stray",
  description: "A domain that uses an op source does not have.",
  usesOps: ["source-lose"],
});
