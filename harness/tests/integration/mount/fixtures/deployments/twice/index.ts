import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "twice",
  packages: ["../../packages/alpha", "../../packages/alpha-copy"],
});
