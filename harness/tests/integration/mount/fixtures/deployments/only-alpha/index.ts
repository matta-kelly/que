import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "only-alpha",
  packages: ["../../packages/alpha"],
});
