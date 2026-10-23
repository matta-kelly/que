import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "old-layout",
  plugins: ["../../plugins/old-layout"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
