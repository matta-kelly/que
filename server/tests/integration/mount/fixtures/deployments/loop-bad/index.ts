import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "loop-bad",
  packages: ["../../packages/gamma", "../../packages/alpha"],
  loops: ["../../loops/endless.ts"],
});
