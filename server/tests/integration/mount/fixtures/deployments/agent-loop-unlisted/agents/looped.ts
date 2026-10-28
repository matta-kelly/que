import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "looped",
  type: "agent",
  description: "The looped agent of a fixture.",
  plugins: [],
  model: "small",
  loop: "long-chat",
});
