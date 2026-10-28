import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "lean",
  type: "agent",
  description: "The lean agent of a fixture.",
  plugins: [],
  model: "small",
  loop: "long-chat",
});
