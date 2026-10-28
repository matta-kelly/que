import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "chat",
  type: "agent",
  description: "The chat agent of a fixture.",
  plugins: ["shop", "shop-twin"],
  model: "small",
  loop: "long-chat",
});
