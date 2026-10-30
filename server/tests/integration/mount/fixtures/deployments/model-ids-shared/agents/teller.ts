import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "teller",
  type: "agent",
  description: "The teller agent of a fixture.",
  plugins: [],
  model: "small",
  loop: "long-chat",
});
