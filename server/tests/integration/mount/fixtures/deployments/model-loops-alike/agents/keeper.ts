import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "keeper",
  type: "agent",
  description: "The keeper agent of a fixture.",
  plugins: [],
  model: "small",
  loop: "long-chat-whole",
});
