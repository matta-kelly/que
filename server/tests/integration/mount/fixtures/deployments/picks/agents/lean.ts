import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "lean",
  type: "agent",
  description: "The agent of a fixture with no plugin, on the big model.",
  plugins: [],
  model: "big",
  loop: "long-chat",
});
