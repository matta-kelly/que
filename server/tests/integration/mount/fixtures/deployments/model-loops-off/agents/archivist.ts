import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "archivist",
  type: "agent",
  description: "The archivist agent of a fixture.",
  plugins: [],
  model: "small",
  loop: "no-summary",
});
