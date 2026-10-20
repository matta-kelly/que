import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "fileless-skill",
  plugins: ["../../packages/fileless-skill"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
