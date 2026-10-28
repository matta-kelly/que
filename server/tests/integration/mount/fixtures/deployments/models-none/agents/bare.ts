import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "bare",
  type: "agent",
  description: "The bare agent of a fixture.",
  plugins: [],
  model: "small",
  loop: "long-chat",
});
