import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "broken",
  packages: ["../../packages/broken"],
  agents: ["../../agents/chat.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
