import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "no-agents",
  packages: ["../../packages/shop"],
});
