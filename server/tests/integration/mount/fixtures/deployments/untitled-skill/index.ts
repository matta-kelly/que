import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "untitled-skill",
  plugins: ["../../plugins/untitled-skill"],
  agents: ["../../agents/bare.ts"],
  loops: ["../../loops/long-chat.ts"],
  models: ["../../models/small.ts"],
});
