import { defineCases } from "@mku1tra/que-plugin";

// Not valid on purpose: no plugin of the deployment holds its capability.
export default defineCases([
  {
    name: "refund-asked",
    type: "case",
    description: "Refunds the last order when asked.",
    capability: "refund",
    input: "Refund the last order.",
    start: "One order exists.",
    good: "The order is refunded.",
  },
]);
