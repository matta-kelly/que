import { definePlugin } from "@mku1tra/que-plugin";

export default definePlugin({
  name: "holder",
  type: "plugin",
  title: "Holder",
  description: "A plugin that holds a capability.",
  capabilities: [
    {
      name: "hold-it",
      type: "capability",
      title: "Hold it",
      description: "A person asks for it and gets it.",
    },
  ],
});
