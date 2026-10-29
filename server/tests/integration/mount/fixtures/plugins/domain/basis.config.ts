// The root of the plugin domain, which a test mounts on its own: a plugin is checked from its root.
import { pluginSchema } from "@mku1tra/que-plugin";

export default {
  schema: pluginSchema({
    name: "domain",
    description: "The plugin domain of a fixture, as a root of its own.",
    root: new URL("./", import.meta.url),
  }),
};
