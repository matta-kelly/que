import { defineAgent } from "@que/core";

export default defineAgent({
  name: "looped",
  plugins: [],
  model: "small",
  loop: "long-chat",
});
