import { defineAgent } from "@que/core";

export default defineAgent({
  name: "bare",
  packages: [],
  model: "small",
  loop: "long-chat",
});
