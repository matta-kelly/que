import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "pluginless",
  plugins: ["../../plugins/shop"],
  agents: ["../../agents/pluginless.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
