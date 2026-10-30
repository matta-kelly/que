// The root of the plugin ledger, which a test mounts on its own: a plugin is checked from its root.
import { pluginSchema } from "@mku1tra/que-plugin";

export default {
  schema: pluginSchema({
    name: "ledger",
    description: "The plugin ledger of a fixture, as a root of its own.",
    root: new URL("./", import.meta.url),
  }),
};
