import { defineAgent } from "@que/core";

export default defineAgent({
  name: "bare",
  plugins: [],
  model: "small",
  loop: "long-chat",
});
