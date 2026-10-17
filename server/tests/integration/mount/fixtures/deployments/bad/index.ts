import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "bad",
  packages: ["../../packages/bad"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
