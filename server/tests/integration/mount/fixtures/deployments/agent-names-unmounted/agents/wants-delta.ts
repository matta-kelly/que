import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "wants-delta",
  type: "agent",
  description: "The wants-delta agent of a fixture.",
  plugins: ["alpha", "delta"],
  model: "small",
  loop: "long-chat",
});
