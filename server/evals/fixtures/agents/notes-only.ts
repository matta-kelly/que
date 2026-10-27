import { defineAgent } from "@mku1tra/que-harness";

export default defineAgent({
  name: "notes-only",
  plugins: ["notes"],
  model: "small",
  loop: "long-chat",
});
