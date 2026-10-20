import { defineAgent } from "@que/core";

export default defineAgent({
  name: "lean",
  plugins: ["shop", "notes"],
  model: "small",
  loop: "long-chat",
});
