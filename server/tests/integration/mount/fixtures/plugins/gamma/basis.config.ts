// The root of the plugin gamma, which a test mounts on its own: a plugin is checked from its root.
import { pluginSchema } from "@mku1tra/que-plugin";

export default {
  schema: pluginSchema({
    name: "gamma",
    description: "The plugin gamma of a fixture, as a root of its own.",
    root: new URL("./", import.meta.url),
  }),
};
