import { definePlugin } from "@mku1tra/que-plugin";

// Breaks the plugin contract on purpose: it has no description.
export default definePlugin({
  name: "untitled",
  title: "Untitled",
} as never);
