import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "packageless",
  plugins: ["../../packages/shop"],
  agents: ["../../agents/packageless.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
