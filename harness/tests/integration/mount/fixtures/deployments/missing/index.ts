import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "missing",
  packages: ["../../packages/nope"],
});
