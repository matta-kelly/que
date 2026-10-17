import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "broken",
  packages: ["../../packages/broken"],
  agents: ["../../agents/chat.ts"],
  models: ["../../models/small.ts"],
});
