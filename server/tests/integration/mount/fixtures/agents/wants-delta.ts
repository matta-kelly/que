import { defineAgent } from "@que/core";

export default defineAgent({
  name: "wants-delta",
  plugins: ["alpha", "delta"],
  model: "small",
  loop: "long-chat",
});
