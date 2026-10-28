import { definePlugin } from "@mku1tra/que-plugin";

export default definePlugin({
  name: "shop",
  type: "plugin",
  title: "Shop",
  description: "The shop's order system.",
  capabilities: [
    {
      name: "find-order",
      type: "capability",
      title: "Find an order",
      description: "A person asks about an order and gets its state.",
    },
  ],
});
