import { defineAgent } from "@que/core";

export default defineAgent({
  name: "lean",
  packages: ["shop", "notes"],
  model: "small",
});
