import { definePlugin } from "@que/core";

export default definePlugin({
  name: "fileless-skill",
  title: "Fileless Skill",
  description:
    "A plugin with a folder under skills/ that has no SKILL.md, which fails the mount.",
});
