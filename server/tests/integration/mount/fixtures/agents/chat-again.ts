import { defineAgent } from "@que/core";

export default defineAgent({
  name: "chat",
  packages: [],
  model: "small",
  loop: "long-chat",
});
