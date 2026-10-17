import { defineAgent } from "@que/core";

export default defineAgent({
  name: "chat",
  packages: ["shop", "notes"],
  model: "small",
  loop: "long-chat",
});
