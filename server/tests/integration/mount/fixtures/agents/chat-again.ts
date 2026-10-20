import { defineAgent } from "@que/core";

export default defineAgent({
  name: "chat",
  plugins: [],
  model: "small",
  loop: "long-chat",
});
