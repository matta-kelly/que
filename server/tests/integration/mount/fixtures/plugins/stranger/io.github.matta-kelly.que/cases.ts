import { defineCases } from "@mku1tra/que-plugin";

// Not valid on purpose: its capability is holder's, not this plugin's.
export default defineCases([
  {
    name: "hold-it-asked",
    type: "case",
    description: "Holds it when asked.",
    capability: "hold-it",
    input: "Hold it.",
    start: "Any.",
    good: "It is held.",
  },
]);
