import { definePlugin } from "@mku1tra/que-plugin";

// Breaks the plugin contract on purpose: it has no description.
export default definePlugin({
  name: "untitled",
  type: "plugin",
  title: "Untitled",
} as never);
