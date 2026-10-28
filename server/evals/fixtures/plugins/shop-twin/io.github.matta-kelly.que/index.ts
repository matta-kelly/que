import { definePlugin } from "@mku1tra/que-plugin";

// Lists shop's capability too: a deployment of both holds it twice.
export default definePlugin({
  name: "shop-twin",
  type: "plugin",
  title: "Shop twin",
  description: "A second order system, which holds shop's capability.",
  capabilities: [
    {
      name: "find-order",
      type: "capability",
      title: "Find an order",
      description: "A person asks about an order and gets its state.",
    },
  ],
});
