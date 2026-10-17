import { defineAgent } from "@que/core";

export default defineAgent({
  name: "looped",
  packages: [],
  model: "small",
  loop: "long-chat",
});
