import { defineCases } from "@que/core";

// Not valid on purpose: the plugin names no capability.
export default defineCases([
  {
    name: "refund-asked",
    description: "Refunds the last order when asked.",
    capability: "refund",
    input: "Refund the last order.",
    start: "One order exists.",
    good: "The order is refunded.",
  },
]);
