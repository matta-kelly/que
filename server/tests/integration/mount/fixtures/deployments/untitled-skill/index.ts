import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "untitled-skill",
  packages: ["../../packages/untitled-skill"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
