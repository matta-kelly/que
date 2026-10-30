import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "clerk",
  type: "agent",
  description:
    "The agent of a fixture that uses the till, on a loop that moves a big result.",
  plugins: ["till"],
  model: "small",
  loop: "small-result",
  // Every op a tool from the start: the tests on this fixture call an op with no load.
  loading: "eager",
});
