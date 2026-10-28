import { definePlugin } from "@mku1tra/que-plugin";

export default definePlugin({
  name: "fileless-skill",
  type: "plugin",
  title: "Fileless Skill",
  description:
    "A plugin with a folder under skills/ that has no SKILL.md, which fails the mount.",
});
