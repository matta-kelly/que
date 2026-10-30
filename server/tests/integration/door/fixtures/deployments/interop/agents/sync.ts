import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "sync",
  type: "agent",
  description: "The agent of a fixture whose config names the domain alone.",
  plugins: ["interop-domain"],
  model: "small",
  loop: "long-chat",
});
