import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "plain",
  type: "agent",
  description:
    "The agent of a fixture with no plugin, on the model with no effort.",
  plugins: [],
  model: "small",
  loop: "long-chat",
});
