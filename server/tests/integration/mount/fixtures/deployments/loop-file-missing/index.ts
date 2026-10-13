import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "loop-file-missing",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  loops: ["../../loops/nope.ts"],
});
