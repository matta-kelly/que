import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "keeper",
  type: "agent",
  description:
    "The agent of a fixture that uses the till, with every op a tool from the start, on instructions of its own.",
  plugins: ["till"],
  model: "small",
  loop: "long-chat",
  loading: "eager",
  instructions: "You keep the till. Count before you answer.",
});
