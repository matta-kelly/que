import { definePackage } from "@que/core";

export default definePackage({
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
