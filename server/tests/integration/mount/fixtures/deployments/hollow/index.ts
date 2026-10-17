import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "hollow",
  packages: ["../../packages/hollow"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
