import { defineAgent } from "@que/core";

export default defineAgent({
  name: "lean",
  plugins: [],
  model: "small",
  loop: "long-chat",
});
