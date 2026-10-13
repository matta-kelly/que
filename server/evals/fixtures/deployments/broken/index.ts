import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "broken",
  packages: ["../../packages/broken"],
});
