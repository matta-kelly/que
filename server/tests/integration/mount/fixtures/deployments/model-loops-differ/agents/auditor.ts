import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "auditor",
  type: "agent",
  description: "The auditor agent of a fixture.",
  plugins: [],
  model: "small",
  loop: "short-chat",
});
