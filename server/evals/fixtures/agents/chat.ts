import { defineAgent } from "@que/core";

export default defineAgent({
  name: "chat",
  plugins: ["shop", "notes"],
  model: "small",
  loop: "long-chat",
});
