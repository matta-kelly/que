import { definePlugin } from "@mku1tra/que-plugin";

export default definePlugin({
  name: "source-domain",
  type: "plugin",
  kind: "domain",
  title: "Source domain",
  description:
    "The test domain of source: its skill lists source's op, so reaching the domain reaches source.",
  usesSkills: ["source-guide"],
});
