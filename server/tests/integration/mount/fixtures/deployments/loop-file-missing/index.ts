import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "loop-file-missing",
  plugins: ["../../packages/gamma", "../../packages/alpha"],
  loops: ["../../loops/nope.ts"],
  agents: ["../../agents/bare.ts"],
  models: ["../../models/small.ts"],
});
