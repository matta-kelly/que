import { defineAgent } from "@que/core";

export default defineAgent({
  name: "notes-only",
  plugins: ["notes"],
  model: "small",
  loop: "long-chat",
});
