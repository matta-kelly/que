import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "clerk",
  type: "agent",
  description:
    "The agent of a fixture that uses the till and alpha, with every op a tool from the start, and the user's own instructions.",
  plugins: ["till", "alpha"],
  model: "small",
  loop: "long-chat",
  loading: "eager",
  userInstructions: true,
});
