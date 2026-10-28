import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "notes-only",
  type: "agent",
  description: "The notes-only agent of a fixture.",
  plugins: ["notes"],
  model: "small",
  loop: "long-chat",
});
