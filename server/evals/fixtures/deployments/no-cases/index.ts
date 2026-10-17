import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "no-cases",
  packages: ["../../packages/notes"],
  agents: ["../../agents/chat.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
