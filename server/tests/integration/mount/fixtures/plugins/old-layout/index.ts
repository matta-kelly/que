import { definePlugin } from "@mku1tra/que-plugin";

// At the plugin's root, where que's files sat before they moved into io.github.matta-kelly.que/.
export default definePlugin({
  name: "old-layout",
  type: "plugin",
  title: "Old layout",
  description: "A plugin whose definition is at its root.",
});
