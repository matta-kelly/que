import { definePlugin } from "@mku1tra/que-plugin";

export default definePlugin({
  name: "domain",
  type: "plugin",
  title: "Domain",
  description: "A domain that uses source's op and skill.",
  usesOps: ["source-find"],
  usesSkills: ["source-guide"],
});
