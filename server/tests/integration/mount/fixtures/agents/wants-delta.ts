import { defineAgent } from "@que/core";

export default defineAgent({
  name: "wants-delta",
  packages: ["alpha", "delta"],
  model: "small",
  loop: "long-chat",
});
