import { definePlugin } from "@que/plugin";

export default definePlugin({
  name: "shop",
  title: "Shop",
  description: "The shop's order system.",
  capabilities: [
    {
      name: "find-order",
      title: "Find an order",
      description: "A person asks about an order and gets its state.",
    },
  ],
});
