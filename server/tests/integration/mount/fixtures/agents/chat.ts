import { defineAgent } from "@que/core";

export default defineAgent({
  name: "chat",
  packages: ["alpha"],
  instructions: "You help the sales team.",
});
