import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "loop-bad",
  plugins: ["../../packages/gamma", "../../packages/alpha"],
  loops: ["../../loops/endless.ts"],
  agents: ["../../agents/bare.ts"],
  models: ["../../models/small.ts"],
});
