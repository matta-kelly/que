import { defineAgent } from "@que/core";

export default defineAgent({
  name: "chat",
  packages: ["alpha"],
  model: "small",
  loop: "long-chat",
  instructions: "You help the sales team.",
});
