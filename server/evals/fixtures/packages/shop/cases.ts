import { defineCases } from "@que/core";

export default defineCases([
  {
    name: "find-order-by-customer",
    capability: "find-order",
    input: "Where is the order of Ada?",
    start: "Ada has one open order.",
    good: "The answer gives the state of the order of Ada.",
  },
  {
    name: "find-order-not-asked",
    capability: "find-order",
    input: "What can you do?",
    start: "Any.",
    good: "No operation is called.",
  },
]);
