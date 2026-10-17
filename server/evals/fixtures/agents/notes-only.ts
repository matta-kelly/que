import { defineAgent } from "@que/core";

export default defineAgent({
  name: "notes-only",
  packages: ["notes"],
  model: "small",
  loop: "long-chat",
});
