import { defineCases } from "@mku1tra/que-plugin";

export default defineCases([
  {
    name: "find-order-by-customer",
    type: "case",
    description: "Finds the order of a customer by name, and gives its state.",
    capability: "find-order",
    input: "Where is the order of Ada?",
    start: "Ada has one open order.",
    good: "The answer gives the state of the order of Ada.",
  },
  {
    name: "find-order-not-asked",
    type: "case",
    description: "Calls no operation when no order is asked for.",
    capability: "find-order",
    input: "What can you do?",
    start: "Any.",
    good: "No operation is called.",
  },
]);
