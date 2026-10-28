import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "on-big",
  type: "agent",
  description: "The on-big agent of a fixture.",
  plugins: [],
  model: "big",
  loop: "long-chat",
});
